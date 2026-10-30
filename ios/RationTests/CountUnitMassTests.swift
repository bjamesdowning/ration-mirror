import XCTest
@testable import Ration

final class CountUnitMassTests: XCTestCase {
    func testUsdaServingOf100gIsOneUnit() {
        let nutrition = NutritionSnapshot(
            source: "usda",
            per100g: NutrientValues(energyKcal: 386, proteinG: 9.9, fatG: 5, carbG: 74.9),
            perServing: NutrientValues(energyKcal: 386, proteinG: 9.9, fatG: 5, carbG: 74.9)
        )
        XCTAssertEqual(CountUnitMass.storedGramsPerUnit(nutrition: nutrition) ?? 0, 100, accuracy: 0.01)
        XCTAssertFalse(CountUnitMass.shouldPersist(nutrition: nutrition, gramsPerUnit: 100))
    }

    func testDensityOnlyDefaultsTo100gAndMustBeSaved() {
        let nutrition = NutritionSnapshot(
            source: "usda",
            per100g: NutrientValues(energyKcal: 100, proteinG: 1, fatG: 0, carbG: 20)
        )
        XCTAssertNil(CountUnitMass.storedGramsPerUnit(nutrition: nutrition))
        XCTAssertEqual(CountUnitMass.suggestedGramsPerUnit(nutrition: nutrition), 100)
        XCTAssertTrue(CountUnitMass.shouldPersist(nutrition: nutrition, gramsPerUnit: 100))
    }

    func testOneUnitAt100gScalesPer100g() {
        // 10 kcal per 10 g is 100 kcal per 100 g. One unit set to 100 g is 100 kcal.
        let nutrition = NutritionSnapshot(
            source: "usda",
            per100g: NutrientValues(energyKcal: 100, proteinG: 0, fatG: 0, carbG: 0)
        )
        let linked = CountUnitMass.snapshot(nutrition, gramsPerUnit: 100)
        XCTAssertEqual(linked?.perServing?.energyKcal ?? 0, 100, accuracy: 0.01)
        XCTAssertEqual(linked?.per100g?.energyKcal ?? 0, 100, accuracy: 0.01)
        let two = CountUnitMass.snapshot(nutrition, gramsPerUnit: 100)
        let eaten = (two?.perServing?.energyKcal ?? 0) * 2
        XCTAssertEqual(eaten, 200, accuracy: 0.01)
    }

    func testChangedGramsReplaceTheStoredUnitMass() {
        let nutrition = NutritionSnapshot(
            source: "usda",
            per100g: NutrientValues(energyKcal: 200, proteinG: 2, fatG: 0, carbG: 0),
            perServing: NutrientValues(energyKcal: 200, proteinG: 2, fatG: 0, carbG: 0)
        )
        XCTAssertTrue(CountUnitMass.shouldPersist(nutrition: nutrition, gramsPerUnit: 50))
        let linked = CountUnitMass.snapshot(nutrition, gramsPerUnit: 50)
        XCTAssertEqual(linked?.perServing?.energyKcal ?? 0, 100, accuracy: 0.01)
    }

    func testOuncesConvertWithoutChangingGrams() {
        let grams = CountUnitMass.grams(from: 1, unit: "oz")
        XCTAssertEqual(grams, IntakeAmount.gramsPerOunce, accuracy: 0.001)
        XCTAssertEqual(CountUnitMass.display(grams: grams, unit: "oz"), 1, accuracy: 0.001)
    }
}
