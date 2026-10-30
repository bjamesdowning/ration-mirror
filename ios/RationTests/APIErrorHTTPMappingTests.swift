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
                existingMealName: nil,
                appStoreUrl: nil
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
                existingMealName: nil,
                appStoreUrl: nil
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

    func testUpgradeRequiredReadsServerMessageAndStoreLink() throws {
        let json = Data("""
        {"error":"Update to keep going.","code":"upgrade_required","minimumVersion":"1.5.11","appStoreUrl":"https://apps.apple.com/app/id6785010110"}
        """.utf8)
        let body = try JSON.decoder.decode(APIErrorBody.self, from: json)
        let requirement = try XCTUnwrap(AppUpdateRequirement(status: 426, body: body))
        XCTAssertEqual(requirement.message, "Update to keep going.")
        XCTAssertEqual(requirement.appStoreURL.absoluteString, "https://apps.apple.com/app/id6785010110")
    }

    func testUpgradeRequiredNeedsBoth426AndCode() throws {
        let coded = try JSON.decoder.decode(
            APIErrorBody.self,
            from: Data(#"{"error":"Old","code":"upgrade_required"}"#.utf8)
        )
        let uncoded = try JSON.decoder.decode(
            APIErrorBody.self,
            from: Data(#"{"error":"Old"}"#.utf8)
        )
        XCTAssertNil(AppUpdateRequirement(status: 403, body: coded))
        XCTAssertNil(AppUpdateRequirement(status: 426, body: uncoded))
        XCTAssertNil(AppUpdateRequirement(status: 426, body: nil))
        XCTAssertEqual(
            AppUpdateRequirement(status: 426, body: coded)?.appStoreURL,
            AppUpdateRequirement.appStoreFallbackURL
        )
    }
}
