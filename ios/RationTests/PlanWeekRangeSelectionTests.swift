import XCTest
@testable import Ration

final class PlanWeekRangeSelectionTests: XCTestCase {
    func testValidRangeWithinSevenDays() {
        XCTAssertTrue(
            PlanWeekRangeSelection.isValid(start: "2026-07-01", end: "2026-07-07")
        )
        XCTAssertEqual(
            PlanWeekRangeSelection.dayCount(start: "2026-07-01", end: "2026-07-07"),
            7
        )
    }

    func testRejectsRangeOverSevenDays() {
        XCTAssertFalse(
            PlanWeekRangeSelection.isValid(start: "2026-07-01", end: "2026-07-09")
        )
    }

    func testSingleDayRange() {
        XCTAssertTrue(
            PlanWeekRangeSelection.isValid(start: "2026-07-03", end: "2026-07-03")
        )
        XCTAssertEqual(
            PlanWeekRangeSelection.dayCount(start: "2026-07-03", end: "2026-07-03"),
            1
        )
    }
}
