import XCTest
@testable import Ration

@MainActor
final class AuthManagerExchangeTests: XCTestCase {
    private let pkceVerifierKey = "pkce_verifier"

    override func setUp() {
        super.setUp()
        MockTokenExchangeURLProtocol.reset()
        Keychain.delete(pkceVerifierKey)
    }

    override func tearDown() {
        Keychain.delete(pkceVerifierKey)
        super.tearDown()
    }

    func testExchangeSurvivesCallerCancellation() async throws {
        Keychain.set("verifier-under-test", for: pkceVerifierKey)
        try XCTSkipIf(
            Keychain.get(pkceVerifierKey) == nil,
            "Keychain access unavailable in this test environment"
        )

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockTokenExchangeURLProtocol.self]
        let session = URLSession(configuration: config)

        let auth = AuthManager(urlSession: session)

        let caller = Task {
            try await auth.exchangeCode("auth-code-test")
        }

        try await Task.sleep(nanoseconds: 20_000_000)
        caller.cancel()

        try await Task.sleep(nanoseconds: 400_000_000)
        XCTAssertTrue(MockTokenExchangeURLProtocol.didComplete)
        XCTAssertTrue(auth.isSignedIn)
        XCTAssertNil(Keychain.get(pkceVerifierKey))
    }

    func testRecordAuthErrorIgnoresCancellation() {
        let auth = AuthManager()
        auth.recordAuthError(URLError(.cancelled))
        XCTAssertNil(auth.authErrorMessage)
    }

    func testRecordAuthErrorMapsInvalidCode() {
        let auth = AuthManager()
        auth.recordAuthError(
            APIError.server(status: 400, message: "Invalid or expired code", code: "invalid_code")
        )
        XCTAssertEqual(
            auth.authErrorMessage,
            AuthHandoffPolicy.userFacingMessage(
                for: APIError.server(status: 400, message: "Invalid or expired code", code: "invalid_code")
            )
        )
    }

    func testRecordAuthErrorIgnoredWhenAlreadySignedIn() {
        let auth = AuthManager()
        auth.adopt(TokenPair(accessToken: "access", refreshToken: "refresh", expiresIn: 3600))
        auth.recordAuthError(
            APIError.server(status: 400, message: "Invalid or expired code", code: "invalid_code")
        )
        XCTAssertNil(auth.authErrorMessage)
        XCTAssertTrue(auth.isSignedIn)
    }
}

private final class MockTokenExchangeURLProtocol: URLProtocol {
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
            {"accessToken":"exchange-access-token","refreshToken":"exchange-refresh-token","expiresIn":3600}
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
