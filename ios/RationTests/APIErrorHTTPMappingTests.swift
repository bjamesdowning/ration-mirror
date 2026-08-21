import XCTest
@testable import Ration

final class APIErrorHTTPMappingTests: XCTestCase {
    func testAccountNotFoundOn404PreservesCode() {
        let error = APIError.fromHTTP(
            status: 404,
            body: APIErrorBody(
                error: APIError.accountNotFoundDefaultMessage,
                message: nil,
                code: APIError.accountNotFoundCode,
                limit: nil,
                resource: nil,
                current: nil,
                tier: nil,
                existingMealId: nil,
                existingMealName: nil
            )
        )
        XCTAssertTrue(error.isAccountNotFound)
        XCTAssertEqual(error.code, "account_not_found")
        XCTAssertEqual(error.statusCode, 404)
        XCTAssertEqual(error.errorDescription, APIError.accountNotFoundDefaultMessage)
    }

    func testAccountNotFoundOn401IsNotSessionExpired() {
        let error = APIError.fromHTTP(
            status: 401,
            body: APIErrorBody(
                error: APIError.accountNotFoundDefaultMessage,
                message: nil,
                code: APIError.accountNotFoundCode,
                limit: nil,
                resource: nil,
                current: nil,
                tier: nil,
                existingMealId: nil,
                existingMealName: nil
            )
        )
        XCTAssertTrue(error.isAccountNotFound)
        XCTAssertNotEqual(error.errorDescription, "Your session expired. Please sign in again.")
    }

    func testBare401WithoutCodeIsUnauthorized() {
        let error = APIError.fromHTTP(status: 401, body: nil)
        XCTAssertEqual(error.code, nil)
        if case .unauthorized = error {
            return
        }
        XCTFail("Expected unauthorized, got \(error)")
    }

    func testServerBusyRequiresCodeNotBare503() {
        let busy = APIError.server(status: 503, message: "Busy", code: "server_busy")
        XCTAssertTrue(busy.isServerBusy)

        let orgSetup = APIError.server(
            status: 503,
            message: "Account setup incomplete.",
            code: "no_organization"
        )
        XCTAssertFalse(orgSetup.isServerBusy)
        XCTAssertFalse(orgSetup.isAccountNotFound)

        let bare503 = APIError.server(status: 503, message: "Unavailable", code: nil)
        XCTAssertFalse(bare503.isServerBusy)
    }
}
