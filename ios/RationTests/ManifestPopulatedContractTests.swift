import XCTest
@testable import Ration

/// Golden wire contract mirrored from `app/lib/__fixtures__/mobile/manifest-populated.json`.
final class ManifestPopulatedContractTests: XCTestCase {
    func testDecodesSharedPopulatedManifestFixture() throws {
        let url = try XCTUnwrap(
            Bundle(for: ManifestPopulatedContractTests.self).url(
                forResource: "manifest-populated",
                withExtension: "json",
                subdirectory: "Fixtures"
            ) ?? Bundle(for: ManifestPopulatedContractTests.self).url(
                forResource: "manifest-populated",
                withExtension: "json"
            )
        )
        let data = try Data(contentsOf: url)
        let response = try JSON.decoder.decode(ManifestResponse.self, from: data)

        XCTAssertEqual(response.entries.count, 1)
        let entry = try XCTUnwrap(response.entries.first)
        XCTAssertEqual(entry.mealName, "Almonds")
        XCTAssertEqual(entry.mealEnergyKcalPerServing ?? -1, 90, accuracy: 0.001)
        XCTAssertNotNil(entry.cookedAt)
        XCTAssertEqual(entry.personalIntake?.energyKcal ?? -1, 90, accuracy: 0.001)
        XCTAssertEqual(response.intakeConsentGranted, true)
    }

    func testDecodesStringMacroAndFractionalIntFields() throws {
        let json = """
        {
          "id": "entry-1",
          "planId": "plan-1",
          "mealId": "meal-1",
          "date": "2026-08-12",
          "slotType": "snack",
          "orderIndex": 1.9,
          "servingsOverride": "2",
          "notes": null,
          "consumedAt": null,
          "cookedAt": "2026-08-12T12:00:00.000Z",
          "createdAt": "2026-08-12T11:00:00.000Z",
          "mealName": "Almonds",
          "mealServings": "1",
          "mealType": "provision",
          "mealPrepTime": null,
          "mealCookTime": null,
          "mealEnergyKcalPerServing": "90",
          "mealProteinGPerServing": "3.5",
          "mealCarbsGPerServing": "2",
          "mealFatGPerServing": "8",
          "personalIntake": {
            "id": "intake-1",
            "servings": "1",
            "energyKcal": "90",
            "proteinG": "3.5",
            "carbsG": "2",
            "fatG": "8",
            "occurredAt": "2026-08-12T12:05:00.000Z",
            "notes": null
          }
        }
        """
        let entry = try JSON.decoder.decode(ManifestEntry.self, from: Data(json.utf8))
        XCTAssertEqual(entry.orderIndex, 1)
        XCTAssertEqual(entry.servingsOverride, 2)
        XCTAssertEqual(entry.mealServings, 1)
        XCTAssertEqual(entry.mealEnergyKcalPerServing ?? -1, 90, accuracy: 0.001)
        XCTAssertEqual(entry.personalIntake?.proteinG ?? -1, 3.5, accuracy: 0.001)
    }
}
