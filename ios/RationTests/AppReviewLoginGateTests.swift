import XCTest
@testable import Ration

final class AppReviewLoginGateTests: XCTestCase {
    func testShowsPasswordOnlyWhenFlagOnAndEmailMatches() {
        XCTAssertTrue(
            AppReviewLoginGate.shouldShowPassword(
                flagEnabled: true,
                email: "app-review@mayutic.com"
            )
        )
        XCTAssertTrue(
            AppReviewLoginGate.shouldShowPassword(
                flagEnabled: true,
                email: "  App-Review@Mayutic.com "
            )
        )
    }

    func testHidesPasswordWhenFlagOff() {
        XCTAssertFalse(
            AppReviewLoginGate.shouldShowPassword(
                flagEnabled: false,
                email: "app-review@mayutic.com"
            )
        )
    }

    func testHidesPasswordForOtherEmails() {
        XCTAssertFalse(
            AppReviewLoginGate.shouldShowPassword(
                flagEnabled: true,
                email: "crew@mayutic.com"
            )
        )
    }
}
