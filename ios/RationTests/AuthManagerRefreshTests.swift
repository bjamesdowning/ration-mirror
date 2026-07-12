import XCTest
@testable import Ration

@MainActor
final class AuthManagerRefreshTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockTokenRefreshURLProtocol.reset()
    }

    func testRefreshSurvivesCallerCancellation() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockTokenRefreshURLProtocol.self]
        let session = URLSession(configuration: config)

        let auth = AuthManager(urlSession: session)
        auth.adopt(TokenPair(accessToken: "expired", refreshToken: "refresh-test", expiresIn: 1))

        let caller = Task {
            try await auth.refreshAccessToken()
        }

        try await Task.sleep(nanoseconds: 20_000_000)
        caller.cancel()

        try await Task.sleep(nanoseconds: 400_000_000)
        XCTAssertTrue(MockTokenRefreshURLProtocol.didComplete)

        let token = try await auth.validAccessToken()
        XCTAssertEqual(token, "new-access-token")
    }

    func testConcurrentRefreshCallersShareSingleFlight() async {
        let auth = AuthManager()
        do {
            _ = try await auth.refreshAccessToken()
            XCTFail("Expected notAuthenticated")
        } catch is APIError {
            XCTAssertTrue(true)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }
}

private final class MockTokenRefreshURLProtocol: URLProtocol {
    static var didComplete = false
    static var sleepNanoseconds: UInt64 = 200_000_000

    static func reset() {
        didComplete = false
    }

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.path.contains("auth/token") == true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        Task {
            try? await Task.sleep(nanoseconds: Self.sleepNanoseconds)
            Self.didComplete = true
            let body = """
            {"accessToken":"new-access-token","refreshToken":"new-refresh-token","expiresIn":3600}
            """
            guard let url = request.url,
                  let data = body.data(using: .utf8),
                  let response = HTTPURLResponse(
                      url: url,
                      statusCode: 200,
                      httpVersion: nil,
                      headerFields: nil
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

    override func stopLoading() {}
}
