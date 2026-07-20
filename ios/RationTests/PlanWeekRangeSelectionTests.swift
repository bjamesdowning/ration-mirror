import XCTest
@testable import Ration

final class PlanWeekRangeSelectionTests: XCTestCase {
    func testValidRangeWithinSevenDays() {
        XCTAssertTrue(
            PlanWeekRangeSelection.isValid(
                start: "2026-07-20",
                end: "2026-07-26",
                today: "2026-07-20"
            )
        )
        XCTAssertEqual(
            PlanWeekRangeSelection.dayCount(start: "2026-07-20", end: "2026-07-26"),
            7
        )
    }

    func testRejectsRangeOverSevenDays() {
        XCTAssertFalse(
            PlanWeekRangeSelection.isValid(
                start: "2026-07-20",
                end: "2026-07-28",
                today: "2026-07-20"
            )
        )
    }

    func testSingleDayRange() {
        XCTAssertTrue(
            PlanWeekRangeSelection.isValid(
                start: "2026-07-20",
                end: "2026-07-20",
                today: "2026-07-20"
            )
        )
        XCTAssertEqual(
            PlanWeekRangeSelection.dayCount(start: "2026-07-20", end: "2026-07-20"),
            1
        )
    }

    func testRejectsRangeOutsidePlanningWindow() {
        XCTAssertFalse(
            PlanWeekRangeSelection.isValid(
                start: "2026-07-19",
                end: "2026-07-20",
                today: "2026-07-20"
            )
        )
        XCTAssertFalse(
            PlanWeekRangeSelection.isValid(
                start: "2026-07-21",
                end: "2026-07-27",
                today: "2026-07-20"
            )
        )
    }

    func testApplyPickerChangeEmptyResetsToToday() {
        let result = PlanWeekRangeSelection.applyPickerChange(
            previousISOs: ["2026-07-20", "2026-07-21"],
            newISOs: [],
            today: "2026-07-20"
        )
        XCTAssertEqual(result.start, "2026-07-20")
        XCTAssertEqual(result.end, "2026-07-20")
    }

    func testApplyPickerChangeExpandsContiguousEndpoints() {
        let result = PlanWeekRangeSelection.applyPickerChange(
            previousISOs: ["2026-07-20"],
            newISOs: ["2026-07-20", "2026-07-23"],
            today: "2026-07-20"
        )
        XCTAssertEqual(result.start, "2026-07-20")
        XCTAssertEqual(result.end, "2026-07-23")
        XCTAssertEqual(
            PlanWeekRangeSelection.dayCount(start: result.start, end: result.end),
            4
        )
    }

    func testApplyPickerChangeRestartsWhenTappingOutsideFilledRange() {
        let previous = Set(ManifestDateHelpers.isoDates(from: "2026-07-20", to: "2026-07-22"))
        let result = PlanWeekRangeSelection.applyPickerChange(
            previousISOs: previous,
            newISOs: previous.union(["2026-07-25"]),
            today: "2026-07-20"
        )
        XCTAssertEqual(result.start, "2026-07-25")
        XCTAssertEqual(result.end, "2026-07-25")
    }

    func testApplyPickerChangeClampsOutOfWindowDates() {
        let result = PlanWeekRangeSelection.applyPickerChange(
            previousISOs: ["2026-07-20"],
            newISOs: ["2026-07-20", "2026-07-27"],
            today: "2026-07-20"
        )
        XCTAssertEqual(result.start, "2026-07-20")
        XCTAssertEqual(result.end, "2026-07-20")
    }

    func testApplyPickerChangeRejectsOverlongByRestartingAtTap() {
        // Within window but longer than maxDays when maxDays is tightened.
        let result = PlanWeekRangeSelection.applyPickerChange(
            previousISOs: ["2026-07-20"],
            newISOs: ["2026-07-20", "2026-07-26"],
            today: "2026-07-20",
            maxDays: 3
        )
        XCTAssertEqual(result.start, "2026-07-26")
        XCTAssertEqual(result.end, "2026-07-26")
    }
}
