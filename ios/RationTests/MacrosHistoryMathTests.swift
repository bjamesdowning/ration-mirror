import XCTest
@testable import Ration

final class MacrosHistoryMathTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    func testWeekRangeFollowsSundayOrMonday() {
        let sunday = MacrosHistoryMath.weekRange(
            containing: "2026-10-30",
            weekStart: "sunday",
            calendar: calendar
        )
        XCTAssertEqual(sunday.from, "2026-10-25")
        XCTAssertEqual(sunday.to, "2026-10-31")

        let monday = MacrosHistoryMath.weekRange(
            containing: "2026-10-30",
            weekStart: "monday",
            calendar: calendar
        )
        XCTAssertEqual(monday.from, "2026-10-26")
        XCTAssertEqual(monday.to, "2026-11-01")
    }

    func testMonthRangeIsTheCalendarMonth() {
        let range = MacrosHistoryMath.monthRange(containing: "2026-10-30", calendar: calendar)
        XCTAssertEqual(range.from, "2026-10-01")
        XCTAssertEqual(range.to, "2026-10-31")
        XCTAssertEqual(
            MacrosHistoryMath.spanDays(from: range.from, to: range.to, calendar: calendar),
            31
        )
    }

    func testLoggedAverageSkipsEmptyDaysAndToday() {
        let days = [
            NutritionDayTotals(date: "2026-10-29", energyKcal: 2000, proteinG: 100, carbsG: 200, fatG: 60, coverageAvg: 1, entryCount: 2),
            NutritionDayTotals.empty(date: "2026-10-30"),
            NutritionDayTotals(date: "2026-10-31", energyKcal: 1000, proteinG: 40, carbsG: 80, fatG: 20, coverageAvg: 1, entryCount: 1),
        ]
        let average = MacrosHistoryMath.loggedAverage(days: days, excluding: "2026-10-31")
        XCTAssertEqual(average?.energyKcal, 2000)
        XCTAssertEqual(average?.proteinG, 100)
        XCTAssertNil(MacrosHistoryMath.loggedAverage(days: [NutritionDayTotals.empty(date: "2026-10-30")]))
    }
}