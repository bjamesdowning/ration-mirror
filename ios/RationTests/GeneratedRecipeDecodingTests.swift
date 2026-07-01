import XCTest
@testable import Ration

final class GeneratedRecipeDecodingTests: XCTestCase {
    func testDecodesStringArrayDirectionsAndNameKeyedIngredients() throws {
        let json = """
        {
          "name": "Potato Salad",
          "description": "Classic",
          "directions": ["Step one is long enough", "Step two is long enough", "Step three is long enough", "Step four is long enough"],
          "ingredients": [{ "name": "potato", "quantity": 2, "unit": "unit" }],
          "prepTime": 10,
          "cookTime": 15
        }
        """
        let recipe = try JSON.decoder.decode(GeneratedRecipe.self, from: Data(json.utf8))
        XCTAssertEqual(recipe.name, "Potato Salad")
        XCTAssertNotNil(recipe.directions)
        XCTAssertTrue(recipe.directions?.contains("Step one") == true)
        XCTAssertEqual(recipe.ingredients?.first?.ingredientName, "potato")
    }

    func testDecodesSerializedDirectionsString() throws {
        let json = """
        {
          "name": "Test",
          "directions": "[{\\"position\\":1,\\"text\\":\\"Mix ingredients together well\\"}]",
          "ingredients": [{ "ingredientName": "flour", "quantity": 1, "unit": "cup" }]
        }
        """
        let recipe = try JSON.decoder.decode(GeneratedRecipe.self, from: Data(json.utf8))
        XCTAssertNotNil(recipe.directions)
        XCTAssertEqual(recipe.ingredients?.first?.ingredientName, "flour")
    }
}
