import Foundation

/// Bearer-authenticated client for `/api/mobile/v1/*`.
/// Automatically attaches the access token and retries once after a 401 by
/// rotating the refresh token via `AuthManager`.
@MainActor
final class APIClient {
    private let auth: AuthManager
    private let session: URLSession

    init(auth: AuthManager) {
        self.auth = auth
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: config)
    }

    // MARK: Verb helpers

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await send(path: path, method: "GET", query: query, body: nil)
    }

    func post<T: Decodable>(_ path: String, body: Encodable) async throws -> T {
        try await send(path: path, method: "POST", query: [], body: encode(body))
    }

    func patch<T: Decodable>(_ path: String, body: Encodable) async throws -> T {
        try await send(path: path, method: "PATCH", query: [], body: encode(body))
    }

    @discardableResult
    func delete<T: Decodable>(_ path: String) async throws -> T {
        try await send(path: path, method: "DELETE", query: [], body: nil)
    }

    /// Multipart image upload for the scan endpoint.
    func uploadImage<T: Decodable>(_ path: String, imageData: Data, filename: String = "scan.jpg") async throws -> T {
        try await uploadMultipartFile(path, fieldName: "image", fileData: imageData, filename: filename, mimeType: "image/jpeg")
    }

    /// Multipart file upload for scan (images or PDF receipts).
    func uploadMultipartFile<T: Decodable>(
        _ path: String,
        fieldName: String,
        fileData: Data,
        filename: String,
        mimeType: String
    ) async throws -> T {
        try await uploadMultipart(path, fieldName: fieldName, imageData: fileData, filename: filename, mimeType: mimeType)
    }

    /// Multipart avatar upload (`avatar` field).
    func uploadAvatar<T: Decodable>(_ path: String, imageData: Data, filename: String = "avatar.jpg", mimeType: String = "image/jpeg") async throws -> T {
        try await uploadMultipart(path, fieldName: "avatar", imageData: imageData, filename: filename, mimeType: mimeType)
    }

    private func uploadMultipart<T: Decodable>(
        _ path: String,
        fieldName: String,
        imageData: Data,
        filename: String,
        mimeType: String
    ) async throws -> T {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(filename)\"\r\n")
        body.append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(imageData)
        body.append("\r\n--\(boundary)--\r\n")

        return try await send(
            path: path,
            method: "POST",
            query: [],
            body: body,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )
    }

    // MARK: Core

    private func encode(_ value: Encodable) -> Data? {
        try? JSON.encoder.encode(AnyEncodable(value))
    }

    private func send<T: Decodable>(
        path: String,
        method: String,
        query: [URLQueryItem],
        body: Data?,
        contentType: String = "application/json",
        isRetry: Bool = false
    ) async throws -> T {
        var components = URLComponents(
            url: AppConfig.apiBaseURL.appending(path: path),
            resolvingAgainstBaseURL: false
        )!
        if !query.isEmpty { components.queryItems = query }

        var req = URLRequest(url: components.url!)
        req.httpMethod = method
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let clientVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        req.setValue("ios/\(clientVersion)", forHTTPHeaderField: "X-Ration-Client")
        if let body {
            req.httpBody = body
            req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }

        let token = try await auth.validAccessToken()
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.transport(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport("No HTTP response")
        }

        if http.statusCode == 401 && !isRetry {
            // Access token may have been revoked/expired mid-flight — rotate once.
            do {
                _ = try await auth.refreshAccessToken()
            } catch {
                await auth.signOutLocal()
                throw APIError.unauthorized
            }
            return try await send(
                path: path, method: method, query: query,
                body: body, contentType: contentType, isRetry: true
            )
        }

        if method == "GET",
           !isRetry,
           (http.statusCode == 429 || http.statusCode == 503)
        {
            let retryAfter = http.value(forHTTPHeaderField: "Retry-After")
                .flatMap(Double.init)
                .map { min(max($0, 0.5), 60) } ?? 2
            try await Task.sleep(nanoseconds: UInt64(retryAfter * 1_000_000_000))
            return try await send(
                path: path, method: method, query: query,
                body: body, contentType: contentType, isRetry: true
            )
        }

        guard (200..<300).contains(http.statusCode) else {
            let errBody = try? JSON.decoder.decode(APIErrorBody.self, from: data)
            if http.statusCode == 401 {
                await auth.signOutLocal()
                throw APIError.unauthorized
            }
            throw APIError.server(
                status: http.statusCode,
                message: errBody?.error,
                code: errBody?.code,
                existingMealId: errBody?.existingMealId,
                existingMealName: errBody?.existingMealName
            )
        }

        if data.isEmpty, let empty = EmptyResponse() as? T {
            return empty
        }

        do {
            return try JSON.decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding("\(error)")
        }
    }
}

/// Type-erased Encodable so the client can accept any request body.
private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { encodeFunc = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFunc(encoder) }
}

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) { append(data) }
    }
}
