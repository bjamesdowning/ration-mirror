import XCTest
@testable import Ration

final class AppReviewLoginGateTests: XCTestCase {
    func testShowsPasswordWhenEmailMatches() {
        XCTAssertTrue(AppReviewLoginGate.shouldShowPassword(email: "app-review@mayutic.com"))
        XCTAssertTrue(AppReviewLoginGate.shouldShowPassword(email: "  App-Review@Mayutic.com "))
    }

    func testHidesPasswordForOtherEmails() {
        XCTAssertFalse(AppReviewLoginGate.shouldShowPassword(email: "crew@mayutic.com"))
    }
}
