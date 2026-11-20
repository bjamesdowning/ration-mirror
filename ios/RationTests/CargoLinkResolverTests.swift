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

    func testResolveCargoIdMatchesTokenPhaseBread() {
        let rows = [
            CargoLinkResolver.Row(id: "cargo-3", name: "white bread"),
        ]
        XCTAssertEqual(
            CargoLinkResolver.resolveCargoId(forName: "bread", in: rows),
            "cargo-3"
        )
    }

    func testResolveCargoIdRejectsFragileMilkCompound() {
        let rows = [
            CargoLinkResolver.Row(id: "cargo-4", name: "coconut milk"),
        ]
        XCTAssertNil(CargoLinkResolver.resolveCargoId(forName: "milk", in: rows))
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

    func testCherryTomatoCoversPluralHyphenAndPackSize() {
        let rows = [
            CargoLinkResolver.Row(id: "tomatoes", name: "cherry tomatoes"),
        ]
        XCTAssertEqual(
            CargoLinkResolver.resolveCargoId(forName: "cherry tomato", in: rows),
            "tomatoes"
        )
        XCTAssertEqual(
            CargoLinkResolver.resolveCargoId(forName: "cherry-tomato", in: rows),
            "tomatoes"
        )
        XCTAssertEqual(
            CargoLinkResolver.resolveCargoId(forName: "cherry tomatoes 250g", in: rows),
            "tomatoes"
        )
    }

    func testBeefMinceCoversGroundBeef() {
        let rows = [
            CargoLinkResolver.Row(id: "beef", name: "ground beef"),
        ]
        XCTAssertEqual(
            CargoLinkResolver.resolveCargoId(forName: "beef mince", in: rows),
            "beef"
        )
    }

    func testThighsDoNotCoverWings() {
        let rows = [
            CargoLinkResolver.Row(id: "wings", name: "chicken wings"),
        ]
        XCTAssertNil(CargoLinkResolver.resolveCargoId(forName: "chicken thighs", in: rows))
    }
}
