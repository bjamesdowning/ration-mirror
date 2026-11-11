import Foundation
import Security

protocol ShareImportLocking {
    func perform<T>(_ work: () async throws -> T) async throws -> T
}

protocol ShareImportCredentialReading: AnyObject {
    func refreshToken() -> String?
    func saveRefresh(_ token: String) -> Bool
}

struct ShareImportTokenPair: Equatable, Sendable {
    var accessToken: String
    var refreshToken: String
}

struct ShareImportAuth {
    var lock: ShareImportLocking
    var credentials: ShareImportCredentialReading
    var refresh: (String) async throws -> ShareImportTokenPair

    func accessToken() async throws -> String {
        try await lock.perform {
            guard let current = credentials.refreshToken(), !current.isEmpty else {
                throw ShareImportServiceError.unauthorized
            }
            let pair = try await refresh(current)
            guard credentials.saveRefresh(pair.refreshToken) else {
                throw ShareImportServiceError.unauthorized
            }
            return pair.accessToken
        }
    }
}

struct ShareImportRefreshLock: ShareImportLocking {
    func perform<T>(_ work: () async throws -> T) async throws -> T {
        do {
            return try await AppGroupFileLock.performOrThrow("auth-refresh.lock", work)
        } catch {
            throw ShareImportServiceError.unauthorized
        }
    }
}

/// Keychain item in the widget access group. Tokens are never written to defaults.
final class ShareImportKeychain: ShareImportCredentialReading {
    func refreshToken() -> String? {
        Self.copy(account: ShareImportKeychainPolicy.refreshAccount)
    }

    func saveRefresh(_ token: String) -> Bool {
        Self.write(token, account: ShareImportKeychainPolicy.refreshAccount)
    }

    private static func query(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: ShareImportKeychainPolicy.service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: ShareImportKeychainPolicy.accessGroup,
        ]
    }

    private static func copy(account: String) -> String? {
        var query = query(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard ShareImportKeychainPolicy.accepted(
            SecItemCopyMatching(query as CFDictionary, &result)
        ), let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func write(_ value: String, account: String) -> Bool {
        let data = Data(value.utf8)
        let query = query(account: account)
        let updated = SecItemUpdate(
            query as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if ShareImportKeychainPolicy.accepted(updated) { return true }
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return ShareImportKeychainPolicy.accepted(SecItemAdd(add as CFDictionary, nil))
    }
}

final class ShareImportLiveService: ShareImportServicing {
    var auth: ShareImportAuth
    var session: URLSession = .shared
    private var cachedAccessToken: String?

    init(auth: ShareImportAuth? = nil) {
        self.auth = auth ?? ShareImportAuth(
            lock: ShareImportRefreshLock(),
            credentials: ShareImportKeychain(),
            refresh: Self.refreshToken
        )
    }

    func accessToken() async throws -> String {
        if let cachedAccessToken { return cachedAccessToken }
        let token = try await auth.accessToken()
        cachedAccessToken = token
        return token
    }

    func loadSession() async throws -> ShareImportSessionSnapshot {
        let payload: SessionPayload = try await send(
            path: "session",
            method: "GET",
            body: nil,
            surface: false
        )
        let consent = payload.user.settings?.aiConsentAt?.isEmpty == false
        return ShareImportSessionSnapshot(
            userId: payload.user.id,
            organizationId: payload.organization.id,
            organizationName: payload.organization.name,
            membershipIds: payload.organizations.map(\.id),
            credits: payload.credits,
            importCost: payload.aiCosts.importUrl,
            hasConsent: consent,
            shareExtensionImport: payload.clientFlags.shareExtensionImport ?? false,
            aiImportWeb: payload.clientFlags.aiImportWeb ?? false,
            aiImportSocial: payload.clientFlags.aiImportSocial ?? false
        )
    }

    func grantConsent() async throws {
        let body: [String: Any] = [
            "action": "enable",
            "feature": "ai",
            "affirmed": true,
            "requestId": UUID().uuidString,
        ]
        let _: FeaturePayload = try await send(
            path: "privacy/features",
            method: "POST",
            body: body,
            surface: false
        )
    }

    func submit(_ body: ShareImportSubmitBody) async throws -> String {
        var json: [String: Any] = [
            "url": body.url,
            "clientRequestId": body.clientRequestId,
        ]
        if let userText = body.userText, !userText.isEmpty {
            json["userText"] = userText
        }
        let response: SubmitPayload = try await send(
            path: "meals/import",
            method: "POST",
            body: json,
            surface: true
        )
        guard let requestId = response.requestId, !requestId.isEmpty else {
            throw ShareImportServiceError.failed("Import started but no request id was returned.")
        }
        return requestId
    }

    func status(_ requestId: String) async throws -> ShareImportJobSnapshot {
        let response: StatusPayload = try await send(
            path: "meals/import/\(requestId)",
            method: "GET",
            body: nil,
            surface: true
        )
        return ShareImportJobSnapshot(
            status: response.status ?? "pending",
            progress: response.progress,
            code: response.code,
            error: response.error,
            existingMealName: response.existingMealName,
            mealName: response.meal?.name,
            needsVerification: response.extractedRecipe != nil && response.meal == nil
        )
    }

    func confirm(_ requestId: String) async throws {
        let _: ConfirmPayload = try await send(
            path: "meals/import/confirm",
            method: "POST",
            body: ["requestId": requestId],
            surface: true
        )
    }

    private func send<Response: Decodable>(
        path: String,
        method: String,
        body: [String: Any]?,
        surface: Bool
    ) async throws -> Response {
        let token = try await accessToken()
        let request = try Self.request(
            path: path,
            method: method,
            body: body,
            token: token,
            surface: surface
        )
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw ShareImportServiceError.failed("Could not reach Ration.")
            }
            if http.statusCode == 401 {
                cachedAccessToken = nil
                let refreshed = try await auth.accessToken()
                cachedAccessToken = refreshed
                let retry = try Self.request(
                    path: path,
                    method: method,
                    body: body,
                    token: refreshed,
                    surface: surface
                )
                let (retryData, retryResponse) = try await session.data(for: retry)
                guard let retryHTTP = retryResponse as? HTTPURLResponse else {
                    throw ShareImportServiceError.unauthorized
                }
                if retryHTTP.statusCode == 401 {
                    throw ShareImportServiceError.unauthorized
                }
                if !(200..<300).contains(retryHTTP.statusCode) {
                    throw Self.map(status: retryHTTP.statusCode, data: retryData)
                }
                return try Self.decode(Response.self, from: retryData)
            }
            if !(200..<300).contains(http.statusCode) {
                throw Self.map(status: http.statusCode, data: data)
            }
            return try Self.decode(Response.self, from: data)
        } catch let error as ShareImportServiceError {
            throw error
        } catch let error as URLError {
            switch error.code {
            case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed:
                throw ShareImportServiceError.offline
            case .timedOut:
                throw ShareImportServiceError.timedOut
            default:
                throw ShareImportServiceError.offline
            }
        }
    }

    private static func decode<Response: Decodable>(_ type: Response.Type, from data: Data) throws -> Response {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw ShareImportServiceError.failed("Could not read the response.")
        }
    }

    private static func request(
        path: String,
        method: String,
        body: [String: Any]?,
        token: String,
        surface: Bool
    ) throws -> URLRequest {
        let url = WidgetAPIBase.resolve().appending(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if surface {
            request.setValue("share-extension", forHTTPHeaderField: "X-Ration-Surface")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        return request
    }

    private static func map(status: Int, data: Data) -> ShareImportServiceError {
        let body = (try? JSONDecoder().decode(ErrorPayload.self, from: data))
        if status == 409 || body?.code == "DUPLICATE_URL" {
            return .duplicate(name: body?.existingMealName)
        }
        if body?.code == "SITE_BLOCKED" || body?.code == "IMPORT_PROVIDER_UNAVAILABLE" {
            return .siteBlocked
        }
        if status == 401 { return .unauthorized }
        if status == 404 { return .notFound }
        if status == 429 { return .rateLimited }
        if status == 402 { return .insufficientCredits(required: body?.required ?? 3) }
        if status == 403, body?.code == "FEATURE_DISABLED" { return .unavailable }
        return .http(status)
    }

    private static func refreshToken(_ token: String) async throws -> ShareImportTokenPair {
        var request = URLRequest(url: WidgetAPIBase.resolve().appending(path: "auth/token"))
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "grantType": "refresh_token",
            "refreshToken": token,
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ShareImportServiceError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 429 { throw ShareImportServiceError.rateLimited }
            throw ShareImportServiceError.unauthorized
        }
        let pair = try JSONDecoder().decode(TokenPayload.self, from: data)
        return ShareImportTokenPair(accessToken: pair.accessToken, refreshToken: pair.refreshToken)
    }
}

private struct TokenPayload: Decodable {
    let accessToken: String
    let refreshToken: String
}

private struct SessionPayload: Decodable {
    struct User: Decodable {
        struct Settings: Decodable {
            let aiConsentAt: String?
        }
        let id: String
        let settings: Settings?
    }
    struct Org: Decodable {
        let id: String
        let name: String
    }
    struct Membership: Decodable {
        let id: String
    }
    struct Costs: Decodable {
        let importUrl: Int
        enum CodingKeys: String, CodingKey {
            case importUrl = "IMPORT_URL"
        }
    }
    struct Flags: Decodable {
        let shareExtensionImport: Bool?
        let aiImportWeb: Bool?
        let aiImportSocial: Bool?
    }
    let user: User
    let organization: Org
    let credits: Int
    let organizations: [Membership]
    let aiCosts: Costs
    let clientFlags: Flags
}

private struct FeaturePayload: Decodable {
    let aiFeatures: Bool?
}

private struct SubmitPayload: Decodable {
    let requestId: String?
}

private struct StatusPayload: Decodable {
    struct Meal: Decodable {
        let name: String?
    }
    struct Recipe: Decodable {
        let name: String?
    }
    let status: String?
    let progress: String?
    let code: String?
    let error: String?
    let existingMealName: String?
    let meal: Meal?
    let extractedRecipe: Recipe?
}

private struct ConfirmPayload: Decodable {
    let meal: StatusPayload.Meal?
}

private struct ErrorPayload: Decodable {
    let code: String?
    let existingMealName: String?
    let required: Int?
}
