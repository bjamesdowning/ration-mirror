import XCTest
@testable import Ration

final class FuelScanAndAddTests: XCTestCase {
    func testScanExplainerUsesTheNewSentence() {
        XCTAssertEqual(
            FuelScanCopy.nextSteps,
            "A photo is taken, analyzed by AI, you can edit what it finds, then add it to Fuel."
        )
        XCTAssertEqual(FuelScanCopy.notMedicalAdvice, "Not medical advice.")
        XCTAssertNotEqual(FuelScanCopy.notMedicalAdvice, FuelScanCopy.nextSteps)
        XCTAssertFalse(FuelScanCopy.nextSteps.contains("Approve is the write"))
    }

    func testOneOunceScalesFromPer100g() {
        let macros = AddFuelScaling.fromPer100g(
            energyKcal: 100,
            proteinG: 10,
            carbG: 20,
            fatG: 5,
            quantity: 1,
            unit: "oz"
        )
        let factor = AddFuelScaling.gramsPerOunce / 100
        XCTAssertEqual(macros?.energyKcal ?? -1, 100 * factor, accuracy: 0.0001)
        XCTAssertEqual(macros?.carbsG ?? -1, 20 * factor, accuracy: 0.0001)
        XCTAssertEqual(AddFuelScaling.gramsPerOunce, 28.3495, accuracy: 0.0001)
    }

    func testMealServingsMultiplyEveryMacro() {
        let macros = AddFuelScaling.meal(
            perServing: .init(energyKcal: 200, proteinG: 12, carbsG: 18, fatG: 8),
            servings: 2
        )
        XCTAssertEqual(macros?.proteinG ?? -1, 24, accuracy: 0.0001)
        XCTAssertEqual(macros?.carbsG ?? -1, 36, accuracy: 0.0001)
        XCTAssertEqual(macros?.fatG ?? -1, 16, accuracy: 0.0001)
        XCTAssertNil(AddFuelScaling.meal(
            perServing: .init(energyKcal: 1, proteinG: 1, carbsG: 1, fatG: 1),
            servings: 0
        ))
    }
}
