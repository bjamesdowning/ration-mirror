import XCTest
@testable import Ration

final class CargoDetailDecodingTests: XCTestCase {
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    func testDecodesValidCargoDetailResponse() throws {
        let json = """
        {
          "item": {
            "id": "item-1",
            "organizationId": "org-1",
            "name": "tomatoes",
            "quantity": 2,
            "unit": "lb",
            "domain": "food",
            "tags": ["produce"],
            "status": "fresh",
            "expiresAt": null,
            "createdAt": "2026-01-01T00:00:00.000Z",
            "updatedAt": "2026-01-01T00:00:00.000Z"
          },
          "connectedMeals": [
            {
              "id": "meal-1",
              "name": "pasta",
              "type": "recipe",
              "tags": ["dinner"],
              "connectedIngredients": [
                {
                  "id": "ing-1",
                  "mealId": "meal-1",
                  "ingredientName": "tomatoes",
                  "quantity": 1,
                  "unit": "lb",
                  "connectionType": "direct"
                }
              ]
            }
          ]
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(CargoDetailResponse.self, from: json)
        XCTAssertEqual(response.item.id, "item-1")
        XCTAssertEqual(response.connectedMeals?.count, 1)
        XCTAssertEqual(response.connectedMeals?.first?.connectedIngredients.first?.ingredientName, "tomatoes")
    }

    func testDecodesCargoDetailWithoutConnectedMeals() throws {
        let json = """
        {
          "item": {
            "id": "item-2",
            "organizationId": "org-1",
            "name": "salt",
            "quantity": 1,
            "unit": "box",
            "domain": "food",
            "tags": [],
            "status": "stable",
            "expiresAt": null,
            "createdAt": "2026-01-01T00:00:00.000Z",
            "updatedAt": "2026-01-01T00:00:00.000Z"
          }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(CargoDetailResponse.self, from: json)
        XCTAssertNil(response.connectedMeals)
    }

    func testDecodesConnectedMealsWithEmptyIngredients() throws {
        let json = """
        {
          "item": {
            "id": "item-3",
            "organizationId": "org-1",
            "name": "olive oil",
            "quantity": 1,
            "unit": "bottle",
            "domain": "food",
            "tags": [],
            "status": "stable",
            "expiresAt": null,
            "createdAt": "2026-01-01T00:00:00.000Z",
            "updatedAt": "2026-01-01T00:00:00.000Z"
          },
          "connectedMeals": [
            {
              "id": "meal-2",
              "name": "salad",
              "type": "recipe",
              "tags": [],
              "connectedIngredients": []
            }
          ]
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(CargoDetailResponse.self, from: json)
        XCTAssertEqual(response.connectedMeals?.first?.connectedIngredients.count, 0)
    }

    func testDecodesConnectedMealWithDescription() throws {
        let json = """
        {
          "item": {
            "id": "item-4",
            "organizationId": "org-1",
            "name": "basil",
            "quantity": 1,
            "unit": "bunch",
            "domain": "food",
            "tags": [],
            "status": "fresh",
            "expiresAt": null,
            "createdAt": "2026-01-01T00:00:00.000Z",
            "updatedAt": "2026-01-01T00:00:00.000Z"
          },
          "connectedMeals": [
            {
              "id": "meal-3",
              "name": "pesto",
              "type": "recipe",
              "description": "Fresh herb sauce",
              "tags": ["quick"],
              "connectedIngredients": []
            }
          ]
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(CargoDetailResponse.self, from: json)
        XCTAssertEqual(response.connectedMeals?.first?.description, "Fresh herb sauce")
    }
}
