import UIKit
import XCTest
@testable import Ration

final class FuelAlignmentTests: XCTestCase {
    func testRockerMatchesManifestType() {
        XCTAssertEqual(DateRockerMetrics.chevronPoints, 17)
        XCTAssertEqual(DateRockerMetrics.labelColor, Theme.carbon)
        XCTAssertEqual(DateRockerMetrics.chevronColor, Theme.muted)
        XCTAssertNotEqual(DateRockerMetrics.labelColor, Theme.hyperGreen)
    }

    func testRemainingRingOverMacroCards() {
        let model = FuelDaySummaryModel.make(
            energyKcal: 1958,
            proteinG: 42,
            carbsG: 200,
            fatG: 70,
            fiberG: 10,
            goal: goal(energy: 2000, protein: 151, carbs: 200, fat: 60, fiber: 30)
        )

        XCTAssertFalse(model.unset)
        XCTAssertEqual(model.calorie?.remaining, 42)
        XCTAssertEqual(model.calorie?.consumed, 1958)
        XCTAssertEqual(model.calorie?.goal, 2000)
        XCTAssertEqual(model.calorie?.goalLine, "Goal 2000 kcal")
        XCTAssertEqual(model.calorie?.progress ?? -1, 1958 / 2000, accuracy: 0.0001)
        XCTAssertEqual(model.calorie?.tone, .inProgress)
        XCTAssertEqual(model.calorie?.tone.ringColor, Theme.hyperGreen)
        XCTAssertEqual(model.macros.map(\.name), ["Protein", "Carbs", "Fat"])
        XCTAssertEqual(model.macros[0].fraction, "42 / 151g")
        XCTAssertEqual(model.macros[0].tone, .inProgress)
        XCTAssertEqual(model.macros[1].tone, .metTarget)
        XCTAssertEqual(model.macros[2].tone, .over)
        XCTAssertFalse(model.macros.contains { $0.name == "Fiber" || $0.fraction.contains("0 / 0") })
        XCTAssertNotEqual(model.calorie?.tone, model.macros[1].tone)
        XCTAssertTrue(model.opensNutritionGoals)
        XCTAssertEqual(FuelDaySummaryModel.goalEditor, "NutritionGoalsView")
    }

    func testClosedCalorieRingIsNotAMetMacro() {
        let model = FuelDaySummaryModel.make(
            energyKcal: 2000,
            proteinG: 151,
            carbsG: 0,
            fatG: 0,
            goal: goal(energy: 2000, protein: 151, carbs: nil, fat: nil, fiber: nil)
        )

        XCTAssertEqual(model.calorie?.remaining, 0)
        XCTAssertEqual(model.calorie?.tone, .closedCeiling)
        XCTAssertEqual(model.calorie?.tone.ringColor, Theme.carbon)
        XCTAssertEqual(model.macros.first?.tone, .metTarget)
        XCTAssertEqual(model.macros.first?.tone.barColor, Theme.hyperGreen)
        XCTAssertNotEqual(model.calorie?.tone, .metTarget)
        XCTAssertNotEqual(model.calorie?.tone.ringColor, model.macros.first?.tone.barColor)
    }

    func testOverGoalUsesTheWarningTone() {
        let model = FuelDaySummaryModel.make(
            energyKcal: 2100,
            proteinG: 160,
            carbsG: 0,
            fatG: 0,
            goal: goal(energy: 2000, protein: 151, carbs: nil, fat: nil, fiber: nil)
        )

        XCTAssertEqual(model.calorie?.remaining, 0)
        XCTAssertEqual(model.calorie?.consumed, 2100)
        XCTAssertEqual(model.calorie?.tone, .over)
        XCTAssertEqual(model.calorie?.tone.ringColor, Theme.warning)
        XCTAssertEqual(model.macros.first?.tone, .over)
        XCTAssertEqual(model.macros.first?.tone.barColor, Theme.warning)
    }

    func testUnsetGoalsDoNotLookLikeALoadedDay() {
        let fiberOnly = FuelDaySummaryModel.make(
            energyKcal: 400,
            proteinG: 20,
            carbsG: 30,
            fatG: 10,
            fiberG: 5,
            goal: goal(energy: nil, protein: nil, carbs: nil, fat: nil, fiber: 25)
        )
        XCTAssertTrue(fiberOnly.unset)
        XCTAssertNil(fiberOnly.calorie)
        XCTAssertTrue(fiberOnly.macros.isEmpty)
        XCTAssertEqual(fiberOnly.accessibilityLabel, "No goals yet. Set targets.")
        XCTAssertEqual(FuelDaySummaryModel.unsetCopy, "No goals yet. Set targets.")
        XCTAssertFalse(fiberOnly.accessibilityLabel.contains("0 / 0"))
        XCTAssertTrue(fiberOnly.opensNutritionGoals)

        let missing = FuelDaySummaryModel.make(
            energyKcal: 0,
            proteinG: 0,
            carbsG: 0,
            fatG: 0,
            goal: nil
        )
        XCTAssertTrue(missing.unset)
        XCTAssertNil(missing.calorie)
        XCTAssertTrue(missing.macros.isEmpty)
    }

    func testAGoalWithNothingEatenStaysOpen() {
        let model = FuelDaySummaryModel.make(
            energyKcal: 0,
            proteinG: 0,
            carbsG: 0,
            fatG: 0,
            goal: goal(energy: 2000, protein: 151, carbs: nil, fat: nil, fiber: nil)
        )

        XCTAssertEqual(model.calorie?.remaining, 2000)
        XCTAssertEqual(model.calorie?.consumed, 0)
        XCTAssertEqual(model.calorie?.tone, .inProgress)
        XCTAssertEqual(model.macros.first?.fraction, "0 / 151g")
        XCTAssertEqual(model.macros.first?.progress, 0)
        XCTAssertEqual(model.macros.first?.tone, .inProgress)
    }

    func testMacrosWithoutACalorieGoalHaveNoRing() {
        let model = FuelDaySummaryModel.make(
            energyKcal: 400,
            proteinG: 42,
            carbsG: 0,
            fatG: 0,
            goal: goal(energy: nil, protein: 151, carbs: nil, fat: nil, fiber: nil)
        )

        XCTAssertFalse(model.unset)
        XCTAssertNil(model.calorie)
        XCTAssertEqual(model.macros.map(\.name), ["Protein"])
        XCTAssertEqual(model.macros[0].fraction, "42 / 151g")
    }

    func testFuelDropsTheDayLayoutControl() {
        XCTAssertFalse(FuelPageContent.includesDayLayoutPicker)
        XCTAssertEqual(FuelPageContent.rowSwipeActions, ["Edit", "Delete"])
        XCTAssertFalse(FuelPageContent.showsStandingVoid)
        XCTAssertEqual(DiaryLayoutMode.normalize("slots"), .slots)
        XCTAssertEqual(DiaryLayoutMode.normalize("timeline"), .timeline)
        XCTAssertEqual(DiaryLayoutMode.normalize(nil), .timeline)
    }

    func testEditKeepsMacrosAmountTimeAndNote() throws {
        let item = try JSONDecoder().decode(
            FuelDayResponse.Item.self,
            from: Data(
                """
                {"id":"a","name":"Eggs","energyKcal":347,"proteinG":20,"carbsG":2,"fatG":4,"occurredAt":"2026-11-11T15:00:00Z","slotType":"lunch","notes":" leftover ","servings":1.5,"loggedAmount":180,"loggedUnit":"g"}
                """.utf8
            )
        )
        let write = FuelLogWrite.editing(item)
        XCTAssertEqual(write.protein, 20)
        XCTAssertEqual(write.carbs, 2)
        XCTAssertEqual(write.fat, 4)
        XCTAssertEqual(write.amount, 180)
        XCTAssertEqual(write.unit, "g")
        XCTAssertEqual(write.occurredAt, "2026-11-11T15:00:00Z")
        XCTAssertEqual(write.notes, "leftover")

        let body = write.body(key: "11111111-1111-1111-1111-111111111111")
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any]
        let macros = object?["macros"] as? [String: Any]
        XCTAssertEqual(macros?["proteinG"] as? Double, 20)
        XCTAssertEqual(macros?["carbsG"] as? Double, 2)
        XCTAssertEqual(macros?["fatG"] as? Double, 4)
        XCTAssertEqual(macros?["energyKcal"] as? Double, 347)
        XCTAssertEqual(object?["occurredAt"] as? String, "2026-11-11T15:00:00Z")
        XCTAssertEqual(object?["amount"] as? Double, 180)
        XCTAssertEqual(object?["unit"] as? String, "g")
        XCTAssertEqual(object?["notes"] as? String, "leftover")
    }

    func testOlderFuelItemsStillDecode() throws {
        let item = try JSONDecoder().decode(
            FuelDayResponse.Item.self,
            from: Data(
                """
                {"id":"a","name":"Eggs","energyKcal":1,"proteinG":0,"carbsG":0,"fatG":0,"occurredAt":"2026-11-11T15:00:00Z","slotType":null}
                """.utf8
            )
        )
        XCTAssertNil(item.notes)
        XCTAssertNil(item.servings)
        XCTAssertNil(item.loggedAmount)
        XCTAssertNil(item.loggedUnit)
    }

    private func goal(
        energy: Double?,
        protein: Double?,
        carbs: Double?,
        fat: Double?,
        fiber: Double?
    ) -> NutritionSummary.Goal {
        NutritionSummary.Goal(
            dailyEnergyKcal: energy,
            proteinG: protein,
            carbsG: carbs,
            fatG: fat,
            fiberG: fiber,
            effectiveFrom: "2026-11-11",
            effectiveTo: nil
        )
    }
}
