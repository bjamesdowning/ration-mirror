import XCTest
@testable import Ration

final class GalleyMatchMapBuilderTests: XCTestCase {
    func testBuildsDictionaryByMealId() throws {
        let json = """
        {
          "meal": {
            "id": "meal-1",
            "organizationId": "org-1",
            "name": "Pasta",
            "domain": "food",
            "type": "recipe",
            "description": null,
            "directions": null,
            "equipment": null,
            "servings": 2,
            "prepTime": null,
            "cookTime": null,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
            "tags": [],
            "ingredients": []
          },
          "matchPercentage": 80,
          "canMake": true,
          "availableIngredients": [],
          "missingIngredients": []
        }
        """.data(using: .utf8)!

        let match = try JSONDecoder.api.decode(MealMatch.self, from: json)
        let map = GalleyMatchMapBuilder.build(from: [match])
        XCTAssertEqual(map["meal-1"]?.matchPercentage, 80)
    }
}

private extension JSONDecoder {
    static var api: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
