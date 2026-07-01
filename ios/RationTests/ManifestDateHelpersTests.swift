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

    func testMultiWeekNavigationNormalization() {
        let today = ManifestDateHelpers.todayISO()
        let weekStart = ManifestDateHelpers.initialRangeStart(calendarSpan: 7, weekStartPref: "sunday")
        var current = weekStart
        for _ in 0..<4 {
            let raw = ManifestDateHelpers.addDays(current, days: 7)
            let next = ManifestDateHelpers.normalizedNavigationStart(
                raw,
                calendarSpan: 7,
                weekStartPref: "sunday"
            )
            XCTAssertTrue(ManifestDateHelpers.canNavigate(from: current, to: next))
            XCTAssertNotEqual(current, next)
            current = next
        }
        XCTAssertNotEqual(current, weekStart)
    }

    func testSpanFiveAnchorsToToday() {
        let today = ManifestDateHelpers.todayISO()
        let anchor = ManifestDateHelpers.initialRangeStart(calendarSpan: 5, weekStartPref: "sunday")
        XCTAssertEqual(anchor, today)
    }

    func testAddDaysAcrossMonthBoundary() {
        let result = ManifestDateHelpers.addDays("2026-01-30", days: 5)
        XCTAssertEqual(result, "2026-02-04")
    }
}
