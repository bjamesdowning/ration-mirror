import XCTest
@testable import Ration

final class CargoNutritionPayloadTests: XCTestCase {
    private func usdaMilk() -> NutritionSnapshot {
        NutritionSnapshot(
            source: "usda",
            confidence: 1,
            verified: true,
            per100g: NutrientValues(
                energyKcal: 50,
                proteinG: 3.4,
                fatG: 2,
                carbG: 5,
                fiberG: 0,
                sugarG: 5,
                satFatG: 1.2,
                sodiumMg: 40,
                saltG: 0.1
            ),
            perServing: NutrientValues(
                energyKcal: 50,
                proteinG: 3.4,
                fatG: 2,
                carbG: 5,
                fiberG: 0,
                sugarG: 5,
                satFatG: 1.2,
                sodiumMg: 40,
                saltG: 0.1
            ),
            fdcId: 1077,
            description: "Milk, 2%"
        )
    }

    func testEditOmitsNutritionWhenNotEdited() {
        let payload = CargoNutritionPayload.forEdit(
            current: usdaMilk(),
            nutritionEdited: false,
            engineEnabled: true
        )
        XCTAssertNil(payload)
    }

    func testEditSendsOverrideWhenEdited() {
        let override = usdaMilk().applyingMacros(energyKcal: 200)
        let payload = CargoNutritionPayload.forEdit(
            current: override,
            nutritionEdited: true,
            engineEnabled: true
        )
        XCTAssertEqual(payload?.source, "user_override")
        XCTAssertEqual(payload?.displayNutrients?.energyKcal, 200)
    }

    func testEditOmitsWhenEngineDisabledEvenIfEdited() {
        let payload = CargoNutritionPayload.forEdit(
            current: usdaMilk().applyingMacros(energyKcal: 10),
            nutritionEdited: true,
            engineEnabled: false
        )
        XCTAssertNil(payload)
    }

    func testCreateSendsNutritionWhenPresent() {
        let snap = usdaMilk()
        let payload = CargoNutritionPayload.forCreate(current: snap, engineEnabled: true)
        XCTAssertEqual(payload?.source, "usda")
        XCTAssertNotNil(payload?.per100g)
    }

    func testUnitOnlyUpdateEncodesWithoutNutritionKey() throws {
        let body = UpdateCargoRequest(
            name: "2% Milk",
            quantity: 1,
            unit: "l",
            domain: "food",
            tags: ["dairy"],
            nutrition: CargoNutritionPayload.forEdit(
                current: usdaMilk(),
                nutritionEdited: false,
                engineEnabled: true
            )
        )
        let data = try JSON.encoder.encode(body)
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertFalse(json.contains("\"nutrition\""))
    }

    func testMacroEditUpdateEncodesUserOverride() throws {
        let body = UpdateCargoRequest(
            quantity: 1,
            unit: "l",
            nutrition: CargoNutritionPayload.forEdit(
                current: usdaMilk().applyingMacros(energyKcal: 120, proteinG: 8),
                nutritionEdited: true,
                engineEnabled: true
            )
        )
        let data = try JSON.encoder.encode(body)
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertTrue(json.contains("\"source\":\"user_override\""))
        XCTAssertTrue(json.contains("\"energyKcal\":120"))
        XCTAssertTrue(json.contains("\"per100g\":null"))
    }

    func testApplyingMacrosClearsDensity() {
        let edited = usdaMilk().applyingMacros(energyKcal: 99)
        XCTAssertEqual(edited.source, "user_override")
        XCTAssertNil(edited.per100g)
        XCTAssertEqual(edited.perServing?.energyKcal, 99)
    }
}
