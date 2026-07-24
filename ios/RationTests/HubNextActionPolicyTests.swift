import XCTest
@testable import Ration

final class HubNextActionPolicyTests: XCTestCase {
    func testPriorityExpiringBeatsSupply() throws {
        let data = try hubFixture(
            expiringCount: 2,
            expiredCount: 1,
            uncheckedCount: 5,
            mealMatchesEmpty: true
        )
        let action = HubNextActionPolicy.nextAction(for: data)
        XCTAssertEqual(action?.key, "expiring")
        XCTAssertEqual(action?.title, "Use expiring cargo")
        XCTAssertEqual(action?.detail, "2 items expiring soon")
        XCTAssertEqual(action?.icon, "clock.badge.exclamationmark")
    }

    func testPrioritySupplyBeatsExpired() throws {
        let data = try hubFixture(
            expiringCount: 0,
            expiredCount: 3,
            uncheckedCount: 4,
            mealMatchesEmpty: true
        )
        let action = HubNextActionPolicy.nextAction(for: data)
        XCTAssertEqual(action?.key, "supply")
        XCTAssertEqual(action?.title, "Finish supply run")
        XCTAssertEqual(action?.detail, "4 items to buy")
        XCTAssertEqual(action?.icon, "cart")
    }

    func testPriorityExpiredBeatsGalley() throws {
        let data = try hubFixture(
            expiringCount: 0,
            expiredCount: 1,
            uncheckedCount: 0,
            mealMatchesEmpty: true
        )
        let action = HubNextActionPolicy.nextAction(for: data)
        XCTAssertEqual(action?.key, "expired")
        XCTAssertEqual(action?.title, "Clear expired cargo")
        XCTAssertEqual(action?.detail, "1 expired items")
        XCTAssertEqual(action?.icon, "xmark.bin")
    }

    func testPriorityGalleyWhenNoMatches() throws {
        let data = try hubFixture(
            expiringCount: 0,
            expiredCount: 0,
            uncheckedCount: 0,
            mealMatchesEmpty: true
        )
        let action = HubNextActionPolicy.nextAction(for: data)
        XCTAssertEqual(action?.key, "galley")
        XCTAssertEqual(action?.title, "Stock Galley")
        XCTAssertEqual(action?.detail, "Add your first meal")
        XCTAssertEqual(action?.icon, "fork.knife")
    }

    func testPriorityScanWhenMatchesExist() throws {
        let data = try hubFixture(
            expiringCount: 0,
            expiredCount: 0,
            uncheckedCount: 0,
            mealMatchesEmpty: false
        )
        let action = HubNextActionPolicy.nextAction(for: data)
        XCTAssertEqual(action?.key, "scan")
        XCTAssertEqual(action?.title, "Scan items")
        XCTAssertEqual(action?.detail, "Add cargo from a photo")
        XCTAssertEqual(action?.icon, "camera.viewfinder")
    }

    // MARK: - Fixtures

    private func hubFixture(
        expiringCount: Int,
        expiredCount: Int,
        uncheckedCount: Int,
        mealMatchesEmpty: Bool
    ) throws -> HubResponse {
        let supplyJSON: String
        if uncheckedCount > 0 {
            supplyJSON = """
            {
              "id": "list_1",
              "name": "Supply",
              "items": [],
              "itemCount": \(uncheckedCount),
              "uncheckedCount": \(uncheckedCount),
              "purchasedCount": 0
            }
            """
        } else {
            supplyJSON = "null"
        }

        let mealMatchesJSON: String
        if mealMatchesEmpty {
            mealMatchesJSON = "[]"
        } else {
            mealMatchesJSON = """
            [{
              "meal": {
                "id": "meal_1",
                "organizationId": "org_1",
                "name": "Pasta",
                "domain": "food",
                "type": "dinner",
                "createdAt": "2024-01-01T00:00:00.000Z",
                "updatedAt": "2024-01-01T00:00:00.000Z",
                "tags": [],
                "ingredients": []
              },
              "matchPercentage": 50,
              "canMake": false
            }]
            """
        }

        let json = """
        {
          "expiringItems": [],
          "cargoStats": {
            "totalItems": 10,
            "expiringCount": \(expiringCount),
            "expiredCount": \(expiredCount)
          },
          "latestSupplyList": \(supplyJSON),
          "manifestPreview": null,
          "expirationAlertDays": 7,
          "hubProfile": null,
          "hubLayout": null,
          "availableMealTags": [],
          "availableCargoTags": null,
          "cargoTagIndex": null,
          "mealMatches": \(mealMatchesJSON),
          "partialMealMatches": [],
          "snackMatches": []
        }
        """
        return try JSON.decoder.decode(HubResponse.self, from: Data(json.utf8))
    }
}
