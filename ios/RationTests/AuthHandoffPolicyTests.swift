import XCTest
@testable import Ration

final class AuthHandoffPolicyTests: XCTestCase {
    func testIgnoresCancellationError() {
        XCTAssertTrue(AuthHandoffPolicy.isIgnorableHandoffError(CancellationError()))
    }

    func testIgnoresURLCancelled() {
        XCTAssertTrue(AuthHandoffPolicy.isIgnorableHandoffError(URLError(.cancelled)))
    }

    func testIgnoresAppleStyleCancelledCode() {
        let error = APIError.server(status: 400, message: "Sign-in cancelled.", code: "cancelled")
        XCTAssertTrue(AuthHandoffPolicy.isIgnorableHandoffError(error))
    }

    func testDoesNotIgnoreInvalidCode() {
        let error = APIError.server(status: 400, message: "Invalid or expired code", code: "invalid_code")
        XCTAssertFalse(AuthHandoffPolicy.isIgnorableHandoffError(error))
    }

    func testUserFacingMessageForInvalidCode() {
        let error = APIError.server(status: 400, message: "Invalid or expired code", code: "invalid_code")
        let message = AuthHandoffPolicy.userFacingMessage(for: error)
        XCTAssertTrue(message.contains("expired or was already used"))
    }

    func testUserFacingMessageForMissingPkceVerifier() {
        let error = APIError.server(
            status: 400,
            message: "Sign-in session lost.",
            code: "missing_pkce_verifier"
        )
        let message = AuthHandoffPolicy.userFacingMessage(for: error)
        XCTAssertTrue(message.contains("Sign-in session lost"))
    }

    func testUserFacingMessageEmptyForCancellation() {
        XCTAssertEqual(AuthHandoffPolicy.userFacingMessage(for: URLError(.cancelled)), "")
    }
}
