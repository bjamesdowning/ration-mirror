import XCTest
@testable import Ration

final class MealAvailabilityEngineTests: XCTestCase {
    func testAvailableWhenSufficientCargo() {
        XCTAssertEqual(
            MealAvailabilityEngine.status(required: 2, available: 2),
            .available
        )
        XCTAssertEqual(
            MealAvailabilityEngine.status(required: 2, available: 5),
            .available
        )
    }

    func testPartialWhenSomeCargo() {
        XCTAssertEqual(
            MealAvailabilityEngine.status(required: 2, available: 1),
            .partial
        )
    }

    func testMissingWhenNoCargo() {
        XCTAssertEqual(
            MealAvailabilityEngine.status(required: 2, available: 0),
            .missing
        )
    }

    func testScaledQuantityDoublesServings() {
        let scaled = MealAvailabilityEngine.scaledQuantity(100, baseServings: 2, desiredServings: 4)
        XCTAssertEqual(scaled, 200)
    }

    func testAvailabilityRowsWhenMatchIsNil() {
        let meal = makeTestMeal(ingredients: [
            MealIngredient(
                id: "i1",
                mealId: "m1",
                cargoId: nil,
                resolvedCargoId: nil,
                ingredientName: "chicken",
                quantity: 1,
                unit: "lb",
                baseQuantity: nil,
                baseUnit: nil,
                isOptional: false,
                orderIndex: 0
            ),
        ])
        let rows = MealAvailabilityEngine.availabilityRows(
            meal: meal,
            match: nil,
            desiredServings: 2
        )
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].status, .partial)
        XCTAssertNil(rows[0].subtitle)
    }

    func testAvailabilityRowsWithDeltaMatch() {
        let meal = makeTestMeal(ingredients: [
            MealIngredient(
                id: "i1",
                mealId: "m1",
                cargoId: nil,
                resolvedCargoId: nil,
                ingredientName: "chicken",
                quantity: 2,
                unit: "lb",
                baseQuantity: nil,
                baseUnit: nil,
                isOptional: false,
                orderIndex: 0
            ),
            MealIngredient(
                id: "i2",
                mealId: "m1",
                cargoId: nil,
                resolvedCargoId: nil,
                ingredientName: "rice",
                quantity: 1,
                unit: "cup",
                baseQuantity: nil,
                baseUnit: nil,
                isOptional: false,
                orderIndex: 1
            ),
        ])
        let match = MealMatch(
            meal: meal,
            matchPercentage: 50,
            canMake: false,
            availableIngredients: [
                IngredientAvailabilityMatch(
                    name: "chicken",
                    requiredQuantity: 2,
                    availableQuantity: 1,
                    unit: "lb"
                ),
            ],
            missingIngredients: [
                MissingIngredientMatch(
                    name: "rice",
                    requiredQuantity: 1,
                    unit: "cup",
                    isOptional: false
                ),
            ]
        )
        let rows = MealAvailabilityEngine.availabilityRows(
            meal: meal,
            match: match,
            desiredServings: 2
        )
        XCTAssertEqual(rows[0].status, .partial)
        XCTAssertNotNil(rows[0].subtitle)
        XCTAssertEqual(rows[1].status, .missing)
        XCTAssertNotNil(rows[1].subtitle)
    }

    private func makeTestMeal(ingredients: [MealIngredient]) -> Meal {
        Meal(
            id: "m1",
            organizationId: "org-1",
            name: "Test",
            domain: "food",
            type: "dinner",
            description: nil,
            directions: nil,
            equipment: [],
            servings: 2,
            prepTime: nil,
            cookTime: nil,
            createdAt: Date(),
            updatedAt: Date(),
            tags: [],
            ingredients: ingredients
        )
    }
}
