import XCTest
@testable import Ration

final class GalleyCookSuccessMessageTests: XCTestCase {
    @MainActor
    func testPartialCookWithSkippedNamesAndDeductions() {
        let skipped = [
            MissingIngredientDetail(name: "milk", required: 2, available: 0, unit: "cup"),
            MissingIngredientDetail(name: "butter", required: 1, available: 0, unit: "tbsp"),
        ]
        let message = GalleyViewModel.cookSuccessMessage(
            servings: 4,
            ingredientsDeducted: 3,
            partialCook: true,
            skippedIngredients: skipped
        )
        XCTAssertEqual(
            message,
            "Cooked 4 servings. Deducted available cargo; skipped: Milk, Butter."
        )
    }

    @MainActor
    func testPartialCookWithZeroDeductions() {
        let skipped = [
            MissingIngredientDetail(name: "eggs", required: 2, available: 0, unit: "each"),
        ]
        let message = GalleyViewModel.cookSuccessMessage(
            servings: 2,
            ingredientsDeducted: 0,
            partialCook: true,
            skippedIngredients: skipped
        )
        XCTAssertEqual(
            message,
            "Cooked 2 servings. Insufficient stock for: Eggs."
        )
    }

    @MainActor
    func testFullCook() {
        let message = GalleyViewModel.cookSuccessMessage(
            servings: 3,
            ingredientsDeducted: 5,
            partialCook: false,
            skippedIngredients: []
        )
        XCTAssertEqual(message, "Cooked 3 servings · 5 deductions")
    }
}
