import XCTest
@testable import Ration

@MainActor
final class APIClientAuthRetryTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockAPIAuthRetryURLProtocol.reset()
    }

    func testGetReplaysOnceAfter401Refresh() async throws {
        MockAPIAuthRetryURLProtocol.mode = .getReplay
        let session = Self.makeSession()
        let auth = AuthManager(urlSession: session)
        auth.adopt(TokenPair(accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 3600))
        let client = APIClient(auth: auth, session: session)

        struct Payload: Decodable { let ok: Bool }
        let payload: Payload = try await client.get("cargo")
        XCTAssertTrue(payload.ok)
        XCTAssertEqual(MockAPIAuthRetryURLProtocol.apiRequestCount, 2)
        XCTAssertEqual(MockAPIAuthRetryURLProtocol.refreshCount, 1)
        XCTAssertEqual(MockAPIAuthRetryURLProtocol.apiMethods, ["GET", "GET"])
    }

    func testPostDoesNotReplayAfter401Refresh() async {
        await assertMutationDoesNotReplay(
            mode: .mutationNoReplay,
            expectedMethod: "POST"
        ) { client in
            struct Body: Encodable { let name: String }
            struct Payload: Decodable { let ok: Bool }
            let _: Payload = try await client.post("cargo", body: Body(name: "milk"))
        }
    }

    func testPatchDoesNotReplayAfter401Refresh() async {
        await assertMutationDoesNotReplay(
            mode: .mutationNoReplay,
            expectedMethod: "PATCH"
        ) { client in
            struct Body: Encodable { let name: String }
            struct Payload: Decodable { let ok: Bool }
            let _: Payload = try await client.patch("cargo/1", body: Body(name: "milk"))
        }
    }

    func testDeleteDoesNotReplayAfter401Refresh() async {
        await assertMutationDoesNotReplay(
            mode: .mutationNoReplay,
            expectedMethod: "DELETE"
        ) { client in
            struct Payload: Decodable { let ok: Bool }
            let _: Payload = try await client.delete("cargo/1")
        }
    }

    func testMultipartPostDoesNotReplayAfter401Refresh() async {
        await assertMutationDoesNotReplay(
            mode: .mutationNoReplay,
            expectedMethod: "POST"
        ) { client in
            struct Payload: Decodable { let ok: Bool }
            let _: Payload = try await client.uploadAvatar(
                "account/avatar",
                imageData: Data([0xFF, 0xD8, 0xFF])
            )
        }
    }

    func testRefreshFailureSignsOutAndThrowsUnauthorized() async {
        MockAPIAuthRetryURLProtocol.mode = .refreshFails
        let session = Self.makeSession()
        let auth = AuthManager(urlSession: session)
        auth.adopt(TokenPair(accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 3600))
        let client = APIClient(auth: auth, session: session)

        struct Payload: Decodable { let ok: Bool }
        do {
            let _: Payload = try await client.get("cargo")
            XCTFail("Expected unauthorized")
        } catch let error as APIError {
            guard case .unauthorized = error else {
                return XCTFail("Expected unauthorized, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        XCTAssertEqual(auth.phase, .signedOut)
        XCTAssertEqual(MockAPIAuthRetryURLProtocol.apiRequestCount, 1)
        XCTAssertEqual(MockAPIAuthRetryURLProtocol.refreshCount, 1)
    }

    private func assertMutationDoesNotReplay(
        mode: MockAPIAuthRetryURLProtocol.Mode,
        expectedMethod: String,
        perform: (APIClient) async throws -> Void
    ) async {
        MockAPIAuthRetryURLProtocol.mode = mode
        let session = Self.makeSession()
        let auth = AuthManager(urlSession: session)
        auth.adopt(TokenPair(accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 3600))
        let client = APIClient(auth: auth, session: session)

        do {
            try await perform(client)
            XCTFail("Expected retryableUnauthorized")
        } catch let error as APIError {
            guard case .retryableUnauthorized = error else {
                return XCTFail("Expected retryableUnauthorized, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        XCTAssertEqual(MockAPIAuthRetryURLProtocol.apiRequestCount, 1)
        XCTAssertEqual(MockAPIAuthRetryURLProtocol.refreshCount, 1)
        XCTAssertEqual(MockAPIAuthRetryURLProtocol.apiMethods, [expectedMethod])
    }

    private static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockAPIAuthRetryURLProtocol.self]
        return URLSession(configuration: config)
    }
}

private final class MockAPIAuthRetryURLProtocol: URLProtocol {
    enum Mode {
        case getReplay
        case mutationNoReplay
        case refreshFails
    }

    static var mode: Mode = .getReplay
    static var apiRequestCount = 0
    static var refreshCount = 0
    static var apiMethods: [String] = []

    static func reset() {
        mode = .getReplay
        apiRequestCount = 0
        refreshCount = 0
        apiMethods = []
    }

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let url = request.url else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }

        if url.path.contains("auth/token") {
            Self.refreshCount += 1
            if Self.mode == .refreshFails {
                respond(status: 401, body: #"{"error":"unauthorized"}"#)
                return
            }
            respond(
                status: 200,
                body: #"{"accessToken":"access-2","refreshToken":"refresh-2","expiresIn":3600}"#
            )
            return
        }

        Self.apiRequestCount += 1
        Self.apiMethods.append(request.httpMethod ?? "")

        switch Self.mode {
        case .getReplay:
            if Self.apiRequestCount == 1 {
                respond(status: 401, body: #"{"error":"unauthorized"}"#)
            } else {
                respond(status: 200, body: #"{"ok":true}"#)
            }
        case .mutationNoReplay, .refreshFails:
            respond(status: 401, body: #"{"error":"unauthorized"}"#)
        }
    }

    override func stopLoading() {}

    private func respond(status: Int, body: String) {
        guard let url = request.url,
              let data = body.data(using: .utf8),
              let response = HTTPURLResponse(
                  url: url,
                  statusCode: status,
                  httpVersion: nil,
                  headerFields: ["Content-Type": "application/json"]
              )
        else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
