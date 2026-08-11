import XCTest
@testable import Ration

/// Golden wire contract mirrored from `app/lib/__fixtures__/mobile/hub-populated.json`.
final class HubPopulatedContractTests: XCTestCase {
    func testDecodesSharedPopulatedHubFixture() throws {
        let url = try XCTUnwrap(
            Bundle(for: HubPopulatedContractTests.self).url(
                forResource: "hub-populated",
                withExtension: "json",
                subdirectory: "Fixtures"
            ) ?? Bundle(for: HubPopulatedContractTests.self).url(
                forResource: "hub-populated",
                withExtension: "json"
            )
        )
        let data = try Data(contentsOf: url)
        let hub = try JSON.decoder.decode(HubResponse.self, from: data)

        XCTAssertEqual(hub.cargoStats.totalItems, 12)
        XCTAssertEqual(hub.mealMatches.count, 1)
        XCTAssertEqual(hub.mealMatches.first?.meal.servings, 2)
        let ingredientQuantity = try XCTUnwrap(hub.mealMatches.first?.meal.ingredients.first?.quantity)
        XCTAssertEqual(ingredientQuantity, 1.4, accuracy: 0.001)
        XCTAssertEqual(hub.snackMatches.count, 1)
        XCTAssertEqual(hub.nutritionToday?.days.first?.entryCount, 1)
        XCTAssertEqual(hub.hubLayout?.widgets.first?.order, 0)
        XCTAssertEqual(hub.flightRecorderActivity?.stats.totals.cooked, 2)
    }

    func testMealRejectsFractionalServings() {
        let json = """
        {
          "id": "meal-1",
          "organizationId": "org-1",
          "name": "Soup",
          "domain": "food",
          "type": "recipe",
          "description": null,
          "directions": null,
          "equipment": null,
          "servings": 1.4,
          "prepTime": null,
          "cookTime": null,
          "createdAt": "2026-08-01T00:00:00.000Z",
          "updatedAt": "2026-08-01T00:00:00.000Z",
          "tags": [],
          "ingredients": []
        }
        """
        XCTAssertThrowsError(try JSON.decoder.decode(Meal.self, from: Data(json.utf8)))
    }
}
