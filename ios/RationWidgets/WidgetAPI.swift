import Foundation

enum WidgetAPIError: Error {
    case signedOut
    case disabled
    case unavailable
}

enum WidgetAuth {
    private static let refreshAccount = "refresh_token"
    private static let accessAccount = "widget_access_token"
    private static let expiryAccount = "widget_access_expiry"

    static func validAccessToken() async throws -> String {
        if let token = WidgetKeychain.get(accessAccount),
           let raw = WidgetKeychain.get(expiryAccount),
           let expiry = TimeInterval(raw),
           Date(timeIntervalSince1970: expiry).timeIntervalSinceNow > 60 {
            return token
        }
        return try await refresh()
    }

    static func refresh() async throws -> String {
        try await AppGroupFileLock.perform("auth-refresh.lock") {
            guard let refreshToken = WidgetKeychain.get(refreshAccount) else {
                throw WidgetAPIError.signedOut
            }
            let pair = try await postRefresh(refreshToken)
            guard WidgetKeychain.set(pair.refreshToken, for: refreshAccount),
                  WidgetKeychain.set(pair.accessToken, for: accessAccount) else {
                throw WidgetAPIError.unavailable
            }
            let expiry = Date().addingTimeInterval(TimeInterval(pair.expiresIn)).timeIntervalSince1970
            WidgetKeychain.set(String(expiry), for: expiryAccount)
            return pair.accessToken
        }
    }

    private struct TokenPair: Decodable {
        let accessToken: String
        let refreshToken: String
        let expiresIn: Int
    }

    private static func postRefresh(_ refreshToken: String) async throws -> TokenPair {
        var request = URLRequest(url: WidgetAPIBase.resolve().appending(path: "auth/token"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 12
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "grantType": "refresh_token",
            "refreshToken": refreshToken,
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw WidgetAPIError.unavailable
        }
        if http.statusCode == 401 || http.statusCode == 400 {
            throw WidgetAPIError.signedOut
        }
        guard (200..<300).contains(http.statusCode) else {
            throw WidgetAPIError.unavailable
        }
        do {
            return try JSONDecoder().decode(TokenPair.self, from: data)
        } catch {
            throw WidgetAPIError.unavailable
        }
    }
}

enum WidgetAPI {
    static func snapshot(date: String) async throws -> HomeWidgetSnapshot {
        try await send(path: "widgets/home", method: "GET", query: [URLQueryItem(name: "date", value: date)], body: nil)
    }

    static func markPurchased(itemId: String) async throws {
        let _: Data = try await send(
            path: "supply/items/\(itemId)",
            method: "PATCH",
            query: [],
            body: ["isPurchased": true]
        )
    }

    static func quickEat(cargoId: String, unit: String, date: String, operationKey: String) async throws {
        let _: Data = try await send(
            path: "cargo/\(cargoId)/quick-eat",
            method: "POST",
            query: [],
            body: [
                "quantity": 1,
                "unit": unit,
                "date": date,
                "operationKey": operationKey,
                "logIntake": true,
            ]
        )
    }

    private static func send<T: Decodable>(
        path: String,
        method: String,
        query: [URLQueryItem],
        body: [String: Any]?,
        retry: Bool = true
    ) async throws -> T {
        let token: String
        do {
            token = try await WidgetAuth.validAccessToken()
        } catch let error as WidgetAPIError {
            throw error
        } catch {
            throw WidgetAPIError.unavailable
        }

        var components = URLComponents(url: WidgetAPIBase.resolve().appending(path: path), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query }
        guard let url = components?.url else { throw WidgetAPIError.unavailable }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        request.setValue("ios/\(version)", forHTTPHeaderField: "X-Ration-Client")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw WidgetAPIError.unavailable
        }
        guard let http = response as? HTTPURLResponse else { throw WidgetAPIError.unavailable }
        if http.statusCode == 401, retry {
            _ = try await WidgetAuth.refresh()
            return try await send(path: path, method: method, query: query, body: body, retry: false)
        }
        // Only the snapshot route is the widget kill switch. Mutation 403s stay on their own flags.
        if http.statusCode == 403, path == "widgets/home" {
            throw WidgetAPIError.disabled
        }
        guard (200..<300).contains(http.statusCode) else {
            throw WidgetAPIError.unavailable
        }
        if T.self == Data.self, let boxed = data as? T {
            return boxed
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw WidgetAPIError.unavailable
        }
    }
}

enum WidgetClock {
    static func localDateString(_ date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
