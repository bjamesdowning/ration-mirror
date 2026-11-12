import XCTest
@testable import Ration

final class FuelAmountSheetTests: XCTestCase {
    func testGramAmountIsNotForcedOntoQuarterGrid() {
        XCTAssertEqual(FuelAmountEntry.openingQuantity(start: 0.1, unit: "g"), 0.1, accuracy: 0.0001)
        XCTAssertNotEqual(FuelAmountEntry.openingQuantity(start: 0.1, unit: "g"), 0.25, accuracy: 0.0001)
        XCTAssertEqual(FuelAmountEntry.acceptedQuantity(1.1, unit: "g"), 1.1, accuracy: 0.0001)
        let snapped = (1.1 / 0.25).rounded() * 0.25
        XCTAssertNotEqual(FuelAmountEntry.acceptedQuantity(1.1, unit: "g"), snapped, accuracy: 0.0001)
        XCTAssertEqual(IntakeAmount.step(forDirectUnit: "g"), 10)
    }

    func testOnePointTwoFiveGramsStayExact() {
        let sent = FuelAmountEntry.submission(
            quantity: 1.25,
            unit: "g",
            notes: "",
            calorieText: ""
        )
        XCTAssertEqual(sent.quantity, 1.25, accuracy: 0.0001)
        XCTAssertNotEqual(sent.quantity, 1.3, accuracy: 0.0001)
        XCTAssertEqual(IntakeAmount.formatLogged(amount: sent.quantity, unit: .g), "1.25 g")
    }

    func testNotesAndEditedCaloriePreviewAreSent() {
        let sent = FuelAmountEntry.submission(
            quantity: 1.25,
            unit: "g",
            notes: " leftover ",
            calorieText: "46"
        )
        XCTAssertEqual(sent.quantity, 1.25, accuracy: 0.0001)
        XCTAssertEqual(sent.notes, "leftover")
        XCTAssertEqual(sent.energyKcal, 46)
    }

    func testFlagOffEatTitleIsUnchanged() {
        XCTAssertEqual(FuelAmountEntry.title(planFuelActionsEnabled: false), "Eat")
        XCTAssertEqual(FuelAmountEntry.title(planFuelActionsEnabled: true), "Fuel")
    }
}
