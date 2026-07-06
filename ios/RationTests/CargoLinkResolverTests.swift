import XCTest
@testable import Ration

final class CargoLinkResolverTests: XCTestCase {
    func testResolveCargoIdMatchesCaseInsensitiveName() {
        let rows = [
            CargoLinkResolver.Row(id: "cargo-1", name: "Salmon Fillet"),
        ]
        XCTAssertEqual(
            CargoLinkResolver.resolveCargoId(forName: "salmon fillet", in: rows),
            "cargo-1"
        )
    }

    func testResolveCargoIdMatchesRegionalSynonyms() {
        let rows = [
            CargoLinkResolver.Row(id: "cargo-2", name: "canned tomatoes"),
        ]
        XCTAssertEqual(
            CargoLinkResolver.resolveCargoId(forName: "tinned tomatoes", in: rows),
            "cargo-2"
        )
    }

    func testResolveCargoIdPrefersResolvedIngredientLink() {
        let ingredient = MealIngredient(
            id: "i1",
            mealId: "m1",
            cargoId: "linked",
            resolvedCargoId: "resolved",
            ingredientName: "salmon",
            quantity: 1,
            unit: "g",
            baseQuantity: nil,
            baseUnit: nil,
            isOptional: false,
            orderIndex: 0
        )
        XCTAssertEqual(CargoLinkResolver.resolveCargoId(for: ingredient), "resolved")
    }
}
