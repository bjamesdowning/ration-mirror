import XCTest
@testable import Ration

final class NutritionSummaryReducerTests: XCTestCase {
    func testApplyingDayTotalsReplacesMatchingDaysAndRecomputesRangeTotals() {
        let summary = NutritionSummary(
            from: "2026-08-01",
            to: "2026-08-03",
            totals: NutritionSummary.Totals(
                energyKcal: 100,
                proteinG: 10,
                carbsG: 20,
                fatG: 5,
                fiberG: 2
            ),
            days: [
                NutritionDayTotals(
                    date: "2026-08-01",
                    energyKcal: 100,
                    proteinG: 10,
                    carbsG: 20,
                    fatG: 5,
                    fiberG: 2,
                    coverageAvg: 1,
                    entryCount: 1
                ),
                NutritionDayTotals.empty(date: "2026-08-02"),
                NutritionDayTotals.empty(date: "2026-08-03"),
            ],
            goal: nil
        )

        let patched = NutritionSummaryReducer.applyingDayTotals(
            summary,
            dayTotals: [
                NutritionDayTotals(
                    date: "2026-08-02",
                    energyKcal: 250,
                    proteinG: 20,
                    carbsG: 30,
                    fatG: 8,
                    fiberG: 4,
                    coverageAvg: 1,
                    entryCount: 1
                ),
            ],
            from: "2026-08-01",
            to: "2026-08-03"
        )

        XCTAssertEqual(patched.days.first(where: { $0.date == "2026-08-02" })?.energyKcal, 250)
        XCTAssertEqual(patched.totals.energyKcal, 350)
        XCTAssertEqual(patched.totals.proteinG, 30)
        XCTAssertEqual(patched.totals.fiberG, 6)
        XCTAssertEqual(patched.days.count, 3)
    }

    func testApplyingDayTotalsOntoEmptyWeekKeepsFullDaySpan() {
        let empty = NutritionSummary(
            from: "2026-08-01",
            to: "2026-08-03",
            totals: NutritionSummary.Totals(
                energyKcal: 0,
                proteinG: 0,
                carbsG: 0,
                fatG: 0,
                fiberG: nil
            ),
            days: [
                NutritionDayTotals.empty(date: "2026-08-01"),
                NutritionDayTotals.empty(date: "2026-08-02"),
                NutritionDayTotals.empty(date: "2026-08-03"),
            ],
            goal: nil
        )

        let patched = NutritionSummaryReducer.applyingDayTotals(
            empty,
            dayTotals: [
                NutritionDayTotals(
                    date: "2026-08-02",
                    energyKcal: 250,
                    proteinG: 20,
                    carbsG: 30,
                    fatG: 8,
                    fiberG: 4,
                    coverageAvg: 1,
                    entryCount: 1
                ),
            ],
            from: "2026-08-01",
            to: "2026-08-03"
        )

        XCTAssertEqual(patched.days.count, 3)
        XCTAssertEqual(patched.totals.energyKcal, 250)
        XCTAssertEqual(patched.days.first(where: { $0.date == "2026-08-01" })?.energyKcal, 0)
        XCTAssertEqual(patched.days.first(where: { $0.date == "2026-08-02" })?.energyKcal, 250)
    }

    func testApplyingDayTotalsIgnoresDaysOutsideRequestedRange() {
        let summary = NutritionSummary(
            from: "2026-08-01",
            to: "2026-08-02",
            totals: NutritionSummary.Totals(
                energyKcal: 50,
                proteinG: 5,
                carbsG: 5,
                fatG: 5,
                fiberG: nil
            ),
            days: [
                NutritionDayTotals(
                    date: "2026-08-01",
                    energyKcal: 50,
                    proteinG: 5,
                    carbsG: 5,
                    fatG: 5,
                    fiberG: nil,
                    coverageAvg: 1,
                    entryCount: 1
                ),
                NutritionDayTotals.empty(date: "2026-08-02"),
            ],
            goal: nil
        )

        let patched = NutritionSummaryReducer.applyingDayTotals(
            summary,
            dayTotals: [
                NutritionDayTotals(
                    date: "2026-07-31",
                    energyKcal: 999,
                    proteinG: 99,
                    carbsG: 99,
                    fatG: 99,
                    fiberG: nil,
                    coverageAvg: 1,
                    entryCount: 1
                ),
            ],
            from: "2026-08-01",
            to: "2026-08-02"
        )

        XCTAssertEqual(patched, summary)
    }
}
