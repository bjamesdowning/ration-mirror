import XCTest
@testable import Ration

final class ManifestDateHelpersTests: XCTestCase {
    func testAddDaysUsesLocalCalendar() {
        let result = ManifestDateHelpers.addDays("2026-06-29", days: 1)
        XCTAssertEqual(result, "2026-06-30")
    }

    func testAddDaysNegative() {
        let result = ManifestDateHelpers.addDays("2026-06-29", days: -1)
        XCTAssertEqual(result, "2026-06-28")
    }

    func testWeekStartSunday() {
        // 2026-06-29 is Monday
        let start = ManifestDateHelpers.weekStart(for: "2026-06-29", preference: "sunday")
        XCTAssertEqual(start, "2026-06-28")
    }

    func testWeekStartMonday() {
        let start = ManifestDateHelpers.weekStart(for: "2026-06-29", preference: "monday")
        XCTAssertEqual(start, "2026-06-29")
    }

    func testCalendarDatesSevenDaySpan() {
        let dates = ManifestDateHelpers.calendarDates(span: 7, anchor: "2026-06-29", weekStartPref: "monday")
        XCTAssertEqual(dates.count, 7)
        XCTAssertEqual(dates.first, "2026-06-29")
        XCTAssertEqual(dates.last, "2026-07-05")
    }
}
