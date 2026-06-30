import XCTest
@testable import Ration

final class ManifestDateHelpersTests: XCTestCase {
    func testSmartLabelToday() {
        let today = ManifestDateHelpers.todayISO()
        XCTAssertEqual(HubDateFormat.smartLabel(isoDate: today), "Today")
    }

    func testCanNavigateWithinBounds() {
        let today = ManifestDateHelpers.todayISO()
        XCTAssertTrue(ManifestDateHelpers.canNavigate(from: today, byDays: 7))
        let farPast = ManifestDateHelpers.addDays(today, days: -ManifestDateHelpers.navigationWeekBound * 7 - 1)
        XCTAssertFalse(ManifestDateHelpers.canNavigate(from: farPast, byDays: -7))
    }

    func testAddDaysAcrossMonthBoundary() {
        let result = ManifestDateHelpers.addDays("2026-01-30", days: 5)
        XCTAssertEqual(result, "2026-02-04")
    }
}
