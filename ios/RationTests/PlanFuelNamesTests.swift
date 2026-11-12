import XCTest
@testable import Ration

final class PlanFuelNamesTests: XCTestCase {
    func testFlagOffKeepsAddToPlanEatAndFork() {
        let copy = PlanFuelNames.snapshot(planFuelActions: false)
        XCTAssertEqual(
            copy,
            PlanFuelNames.Snapshot(
                emptyState: "Add to plan",
                addSheetTitle: "Add to plan",
                plateUpTitle: "Eat",
                plateUpAmountHeader: "How much did you eat?",
                logToFuelSymbol: "fork.knife"
            )
        )
    }

    func testFlagOnUsesManifestFuelAndFlame() {
        let copy = PlanFuelNames.snapshot(planFuelActions: true)
        XCTAssertEqual(
            copy,
            PlanFuelNames.Snapshot(
                emptyState: "Add to Manifest",
                addSheetTitle: "Add to Manifest",
                plateUpTitle: "Fuel",
                plateUpAmountHeader: "Amount",
                logToFuelSymbol: "flame.fill"
            )
        )
        XCTAssertNotEqual(copy.plateUpAmountHeader, "How much did you eat?")
    }
}
