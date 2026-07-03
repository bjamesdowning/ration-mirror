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
    private let session = URLSession(configuration: .ephemeral)

    var isSignedIn: Bool { phase == .signedIn }

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
    @discardableResult
    func refreshAccessToken() async throws -> String {
        if let task = refreshTask { return try await task.value }
        guard let refreshToken else { throw APIError.notAuthenticated }

        let task = Task<String, Error> {
            defer { refreshTask = nil }
            let pair = try await postToken(body: [
                "grantType": "refresh_token",
                "refreshToken": refreshToken,
            ])
            apply(pair)
            return pair.accessToken
        }
        refreshTask = task
        return try await task.value
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
        var req = URLRequest(url: AppConfig.apiBaseURL.appending(path: "auth/token"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSON.encoder.encode(body)
        let (data, response) = try await session.data(for: req)
        try Self.ensureOK(data: data, response: response)
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
