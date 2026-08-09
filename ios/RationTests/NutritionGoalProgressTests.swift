import XCTest
@testable import Ration

final class NutritionGoalProgressTests: XCTestCase {
    func testRatioIsNilWhenTargetMissing() {
        XCTAssertNil(NutritionGoalProgress.ratio(actual: 1200, target: nil))
    }

    func testRatioIsNilWhenTargetIsZeroOrNegative() {
        XCTAssertNil(NutritionGoalProgress.ratio(actual: 1200, target: 0))
        XCTAssertNil(NutritionGoalProgress.ratio(actual: 1200, target: -10))
    }

    func testRatioComputesFraction() {
        XCTAssertEqual(NutritionGoalProgress.ratio(actual: 1500, target: 2000) ?? -1, 0.75, accuracy: 0.0001)
    }

    func testRatioCanExceedOneHundredPercent() {
        XCTAssertEqual(NutritionGoalProgress.ratio(actual: 2500, target: 2000) ?? -1, 1.25, accuracy: 0.0001)
    }

    func testClampedCapsAtOneAndFloorsAtZero() {
        XCTAssertEqual(NutritionGoalProgress.clamped(1.25), 1.0, accuracy: 0.0001)
        XCTAssertEqual(NutritionGoalProgress.clamped(-0.5), 0.0, accuracy: 0.0001)
        XCTAssertEqual(NutritionGoalProgress.clamped(nil), 0.0, accuracy: 0.0001)
    }

    func testRatiosDerivesAllFourMacrosFromTotalsAndGoal() {
        let totals = NutritionSummary.Totals(energyKcal: 1800, proteinG: 90, carbsG: 200, fatG: 60)
        let goal = NutritionSummary.Goal(
            dailyEnergyKcal: 2000, proteinG: 120, carbsG: 250, fatG: 70,
            fiberG: 30, effectiveFrom: "2026-01-01", effectiveTo: nil
        )
        let ratios = NutritionGoalProgress.ratios(totals: totals, goal: goal)
        XCTAssertEqual(ratios.energy ?? -1, 0.9, accuracy: 0.0001)
        XCTAssertEqual(ratios.protein ?? -1, 0.75, accuracy: 0.0001)
        XCTAssertEqual(ratios.carbs ?? -1, 0.8, accuracy: 0.0001)
        XCTAssertEqual(ratios.fat ?? -1, 60.0 / 70.0, accuracy: 0.0001)
        // Fiber has no per-day actual by default — goal-only per ration-master rule.
        XCTAssertNil(ratios.fiber)
    }

    func testRatiosIsAllNilWhenGoalIsMissing() {
        let totals = NutritionSummary.Totals(energyKcal: 1800, proteinG: 90, carbsG: 200, fatG: 60)
        let ratios = NutritionGoalProgress.ratios(totals: totals, goal: nil)
        XCTAssertNil(ratios.energy)
        XCTAssertNil(ratios.protein)
        XCTAssertNil(ratios.carbs)
        XCTAssertNil(ratios.fat)
    }

    func testFillSparseDaysBackfillsMissingDatesWithZeroes() {
        let days = [
            NutritionDayTotals(date: "2026-01-01", energyKcal: 1800, proteinG: 90, carbsG: 200, fatG: 60, coverageAvg: 0.8, entryCount: 3),
            NutritionDayTotals(date: "2026-01-03", energyKcal: 2000, proteinG: 100, carbsG: 220, fatG: 65, coverageAvg: 0.9, entryCount: 2),
        ]
        let filled = NutritionDayFill.fillSparseDays(from: "2026-01-01", to: "2026-01-03", days: days)
        XCTAssertEqual(filled.map(\.date), ["2026-01-01", "2026-01-02", "2026-01-03"])
        XCTAssertEqual(filled[1].energyKcal, 0)
        XCTAssertEqual(filled[1].entryCount, 0)
        XCTAssertEqual(filled[0].energyKcal, 1800)
        XCTAssertEqual(filled[2].entryCount, 2)
    }

    func testFillSparseDaysHandlesEmptyServerDays() {
        let filled = NutritionDayFill.fillSparseDays(from: "2026-02-01", to: "2026-02-02", days: [])
        XCTAssertEqual(filled.map(\.date), ["2026-02-01", "2026-02-02"])
        XCTAssertTrue(filled.allSatisfy { $0.entryCount == 0 })
    }

    func testFillSparseDaysReturnsInputWhenRangeIsInvalid() {
        let days = [NutritionDayTotals.empty(date: "2026-01-01")]
        let filled = NutritionDayFill.fillSparseDays(from: "not-a-date", to: "also-not-a-date", days: days)
        XCTAssertEqual(filled, days)
    }

    func testManifestStripLinesOnlyIncludesSetTargets() {
        let day = NutritionDayTotals(
            date: "2026-08-09",
            energyKcal: 1240,
            proteinG: 95,
            carbsG: 110,
            fatG: 40,
            coverageAvg: 1,
            entryCount: 2
        )
        let goal = NutritionSummary.Goal(
            dailyEnergyKcal: 2000,
            proteinG: 150,
            carbsG: nil,
            fatG: 70,
            fiberG: 30,
            effectiveFrom: "2026-01-01",
            effectiveTo: nil
        )
        let lines = NutritionGoalProgress.manifestStripLines(day: day, goal: goal)
        XCTAssertEqual(lines.map(\.key), ["energy", "protein", "fat"])
        XCTAssertEqual(lines[0].displayText, "1240 / 2000 kcal")
        XCTAssertEqual(lines[1].displayText, "95 / 150 g")
        XCTAssertNil(lines.first { $0.key == "carbs" })
    }

    func testManifestStripLinesEmptyWithoutGoal() {
        let day = NutritionDayTotals.empty(date: "2026-08-09")
        XCTAssertTrue(NutritionGoalProgress.manifestStripLines(day: day, goal: nil).isEmpty)
    }
}
