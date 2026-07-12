import Foundation
import Observation

/// Owns the mobile token lifecycle: code exchange, refresh-token rotation,
/// Keychain persistence, and the published `isAuthenticated` gate.
///
/// The token endpoint (`/auth/token`) is unauthenticated, so `AuthManager`
/// performs those calls directly with `URLSession` — `APIClient` depends on this
/// type for access tokens, not the other way around (no dependency cycle).
@MainActor
@Observable
final class AuthManager {
    enum Phase: Equatable {
        case loading
        case signedOut
        case signedIn
    }

    private(set) var phase: Phase = .loading
    private(set) var authErrorMessage: String?

    /// Invoked at the end of `signOutLocal()`, after token state is cleared.
    /// Wired once in `AppEnvironment.init()` to run the same full-wipe
    /// sequence (`SnapshotStore`, `BillingManager`, `SessionStore`, the
    /// authenticated-image cache) that explicit sign-out already runs, so a
    /// forced 401 logout doesn't leave a signed-out user's cached data
    /// readable to whoever signs in next on a shared device (H-2).
    var onSignedOut: (() async -> Void)?

    private var accessToken: String?
    private var refreshToken: String? {
        didSet {
            if let refreshToken {
                Keychain.set(refreshToken, for: Self.refreshKey)
            } else {
                Keychain.delete(Self.refreshKey)
            }
        }
    }
    private var accessExpiry: Date?
    private var refreshTask: Task<String, Error>?

    private static let refreshKey = "refresh_token"
    private static let pkceVerifierKey = "pkce_verifier"
    private let session: URLSession

    var isSignedIn: Bool { phase == .signedIn }

    init(urlSession: URLSession = URLSession(configuration: .ephemeral)) {
        self.session = urlSession
    }

    // MARK: Bootstrap

    /// Called at launch — restore a session from a persisted refresh token.
    func bootstrap() async {
        guard let stored = Keychain.get(Self.refreshKey) else {
            phase = .signedOut
            return
        }
        refreshToken = stored
        do {
            _ = try await refreshAccessToken()
            phase = .signedIn
        } catch {
            await signOutLocal()
        }
    }

    // MARK: Social sign-in

    func signInWithSocial(
        provider: String,
        idToken: String,
        nonce: String? = nil,
        accessToken: String? = nil,
        givenName: String? = nil,
        familyName: String? = nil,
        tosAccepted: Bool
    ) async throws {
        clearAuthError()
        var body: [String: Any] = [
            "provider": provider,
            "idToken": idToken,
        ]
        if tosAccepted {
            body["tosAccepted"] = true
        }
        if let nonce {
            body["nonce"] = nonce
        }
        if let accessToken {
            body["accessToken"] = accessToken
        }
        if provider == "apple", givenName != nil || familyName != nil {
            var fullName: [String: String] = [:]
            if let givenName { fullName["givenName"] = givenName }
            if let familyName { fullName["familyName"] = familyName }
            body["fullName"] = fullName
        }

        let pair = try await postTokenDictionary(body: body, endpoint: "auth/social")
        apply(pair)
        phase = .signedIn
    }

    // MARK: Magic link + code exchange

    func requestMagicLink(email: String) async throws {
        clearAuthError()
        // PKCE: persist the verifier so it survives backgrounding while the user
        // checks email, and send only the S256 challenge.
        let verifier = PKCE.makeVerifier()
        Keychain.set(verifier, for: Self.pkceVerifierKey)
        var req = URLRequest(url: AppConfig.apiBaseURL.appending(path: "auth/magic-link"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSON.encoder.encode([
            "email": email,
            "codeChallenge": PKCE.challenge(for: verifier),
        ])
        let (data, response) = try await session.data(for: req)
        try Self.ensureOK(data: data, response: response)
    }

    /// Exchange the `ration://auth/callback?code=...` code for tokens, proving
    /// possession of the PKCE verifier saved when the magic link was requested.
    func exchangeCode(_ code: String) async throws {
        clearAuthError()
        guard let verifier = Keychain.get(Self.pkceVerifierKey) else {
            throw APIError.server(
                status: 400,
                message: "Sign-in session lost. Request a new magic link from the app, then open the email link without reinstalling the app.",
                code: "missing_pkce_verifier"
            )
        }
        let pair = try await postToken(body: [
            "grantType": "authorization_code",
            "code": code,
            "codeVerifier": verifier,
        ])
        Keychain.delete(Self.pkceVerifierKey)
        apply(pair)
        phase = .signedIn
    }

    /// Surface callback/token exchange failures in the signed-out UI instead of
    /// silently ignoring deep links with expired or already-consumed codes.
    func recordAuthError(_ error: Error) {
        authErrorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        phase = .signedOut
    }

    func clearAuthError() {
        authErrorMessage = nil
    }

    /// Adopt a token pair issued by another endpoint (e.g. org switch, which
    /// rebinds the org claim and revokes prior refresh families server-side).
    func adopt(_ pair: TokenPair) {
        clearAuthError()
        apply(pair)
        phase = .signedIn
    }

    // MARK: Access tokens

    /// Returns a valid access token, refreshing proactively when within 60s of expiry.
    func validAccessToken() async throws -> String {
        if let token = accessToken, let expiry = accessExpiry, expiry.timeIntervalSinceNow > 60 {
            return token
        }
        return try await refreshAccessToken()
    }

    /// Single-flight refresh — concurrent callers await the same rotation.
    /// Uses a detached task so SwiftUI `.task` cancellation cannot abort token rotation.
    @discardableResult
    func refreshAccessToken() async throws -> String {
        if let task = refreshTask { return try await task.value }
        guard let refreshToken else { throw APIError.notAuthenticated }

        let token = refreshToken
        let baseURL = AppConfig.apiBaseURL
        let session = self.session

        let task = Task.detached(priority: .userInitiated) { () async throws -> String in
            let pair = try await Self.postTokenDetached(
                refreshToken: token,
                baseURL: baseURL,
                session: session
            )
            await MainActor.run { [weak self] in
                self?.apply(pair)
            }
            return pair.accessToken
        }
        refreshTask = task
        do {
            let accessToken = try await task.value
            refreshTask = nil
            return accessToken
        } catch {
            refreshTask = nil
            throw error
        }
    }

    // MARK: Sign out

    func signOut() async {
        if let token = try? await validAccessToken() {
            var req = URLRequest(url: AppConfig.apiBaseURL.appending(path: "auth/session"))
            req.httpMethod = "DELETE"
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            _ = try? await session.data(for: req)
        }
        await signOutLocal()
    }

    func signOutLocal() async {
        accessToken = nil
        accessExpiry = nil
        refreshToken = nil
        // M-12: an abandoned magic-link request otherwise leaves this orphaned in Keychain indefinitely.
        Keychain.delete(Self.pkceVerifierKey)
        clearAuthError()
        phase = .signedOut
        await onSignedOut?()
    }

    // MARK: Helpers

    private func apply(_ pair: TokenPair) {
        accessToken = pair.accessToken
        refreshToken = pair.refreshToken
        accessExpiry = Date().addingTimeInterval(TimeInterval(pair.expiresIn))
    }

    private func postToken(body: [String: String]) async throws -> TokenPair {
        try await postTokenDictionary(body: body, endpoint: "auth/token")
    }

    private static func postTokenDetached(
        refreshToken: String,
        baseURL: URL,
        session: URLSession
    ) async throws -> TokenPair {
        try await postTokenDictionaryDetached(
            body: [
                "grantType": "refresh_token",
                "refreshToken": refreshToken,
            ],
            endpoint: "auth/token",
            baseURL: baseURL,
            session: session
        )
    }

    private func postTokenDictionary(body: [String: Any], endpoint: String) async throws -> TokenPair {
        try await Self.postTokenDictionaryDetached(
            body: body,
            endpoint: endpoint,
            baseURL: AppConfig.apiBaseURL,
            session: session
        )
    }

    private static func postTokenDictionaryDetached(
        body: [String: Any],
        endpoint: String,
        baseURL: URL,
        session: URLSession
    ) async throws -> TokenPair {
        var req = URLRequest(url: baseURL.appending(path: endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: req)
        try ensureOK(data: data, response: response)
        do {
            return try JSON.decoder.decode(TokenPair.self, from: data)
        } catch {
            throw APIError.decoding("\(error)")
        }
    }

    private static func ensureOK(data: Data, response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport("No HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let body = try? JSON.decoder.decode(APIErrorBody.self, from: data)
            if http.statusCode == 401 { throw APIError.unauthorized }
            throw APIError.server(status: http.statusCode, message: body?.error, code: body?.code)
        }
    }
}
