import XCTest
@testable import Ration

final class AllergenDetectorTests: XCTestCase {
    func testEmptyAllergensReturnsEmpty() {
        XCTAssertEqual(
            AllergenDetector.detect(
                ingredientNames: ["peanut butter", "chicken"],
                userAllergens: []
            ),
            []
        )
    }

    func testEmptyIngredientsReturnsEmpty() {
        XCTAssertEqual(
            AllergenDetector.detect(
                ingredientNames: [],
                userAllergens: ["peanuts"]
            ),
            []
        )
    }

    func testSimplePeanutMatch() {
        let result = AllergenDetector.detect(
            ingredientNames: ["peanut butter", "flour"],
            userAllergens: ["peanuts"]
        )
        XCTAssertEqual(result, ["peanuts"])
    }

    func testCaseInsensitive() {
        let result = AllergenDetector.detect(
            ingredientNames: ["PEANUT BUTTER"],
            userAllergens: ["peanuts"]
        )
        XCTAssertEqual(result, ["peanuts"])
    }

    func testMultipleAllergens() {
        let result = AllergenDetector.detect(
            ingredientNames: ["peanut oil", "cheddar cheese", "whole milk"],
            userAllergens: ["peanuts", "milk"]
        )
        XCTAssertEqual(Set(result), Set(["peanuts", "milk"]))
    }

    func testNoFalsePositives() {
        let result = AllergenDetector.detect(
            ingredientNames: ["chicken", "rice", "olive oil"],
            userAllergens: ["peanuts", "shellfish", "milk"]
        )
        XCTAssertEqual(result, [])
    }

    func testWheatViaFlourSynonym() {
        let result = AllergenDetector.detect(
            ingredientNames: ["all-purpose flour"],
            userAllergens: ["wheat"]
        )
        XCTAssertEqual(result, ["wheat"])
    }

    func testTreeNutsViaAlmond() {
        let result = AllergenDetector.detect(
            ingredientNames: ["sliced almonds", "sugar"],
            userAllergens: ["tree-nuts"]
        )
        XCTAssertEqual(result, ["tree-nuts"])
    }

    func testSesameViaTahini() {
        let result = AllergenDetector.detect(
            ingredientNames: ["tahini paste", "lemon"],
            userAllergens: ["sesame"]
        )
        XCTAssertEqual(result, ["sesame"])
    }

    func testMilkViaButter() {
        let result = AllergenDetector.detect(
            ingredientNames: ["unsalted butter"],
            userAllergens: ["milk"]
        )
        XCTAssertEqual(result, ["milk"])
    }

    func testEggsPartialMatch() {
        let result = AllergenDetector.detect(
            ingredientNames: ["2 large eggs", "flour"],
            userAllergens: ["eggs"]
        )
        XCTAssertEqual(result, ["eggs"])
    }

    func testOnlyReturnsTriggeredSubset() {
        let result = AllergenDetector.detect(
            ingredientNames: ["tofu", "soy sauce"],
            userAllergens: ["soybeans", "peanuts", "milk"]
        )
        XCTAssertEqual(result, ["soybeans"])
    }

    func testMixedCaseAndWhitespace() {
        let result = AllergenDetector.detect(
            ingredientNames: ["  WHOLE Wheat Flour  "],
            userAllergens: ["wheat"]
        )
        XCTAssertEqual(result, ["wheat"])
    }

    func testIgnoresUnknownAllergenSlugs() {
        let result = AllergenDetector.detect(
            ingredientNames: ["peanut butter"],
            userAllergens: ["not-a-real-allergen", "peanuts"]
        )
        XCTAssertEqual(result, ["peanuts"])
    }

    func testMealContainsAllergen() {
        XCTAssertTrue(
            AllergenDetector.mealContainsAllergen(
                ingredientNames: ["peanut butter"],
                userAllergens: ["peanuts"]
            )
        )
        XCTAssertFalse(
            AllergenDetector.mealContainsAllergen(
                ingredientNames: ["chicken", "rice"],
                userAllergens: ["peanuts", "milk"]
            )
        )
    }

    func testCatalogHasLabelForEveryOption() {
        for option in AllergenCatalog.options {
            XCTAssertFalse(option.label.isEmpty)
            XCTAssertEqual(AllergenCatalog.label(for: option.id), option.label)
            XCTAssertNotNil(AllergenCatalog.keywords[option.id])
        }
        XCTAssertEqual(AllergenCatalog.options.count, 14)
    }

    func testParseFiltersInvalidSlugs() {
        XCTAssertEqual(
            AllergenCatalog.parse(["peanuts", "unknown", "milk"]),
            ["peanuts", "milk"]
        )
        XCTAssertEqual(AllergenCatalog.parse(nil), [])
    }
}
