import XCTest
@testable import Ration

final class NutritionModelsDecodingTests: XCTestCase {
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    // MARK: - Nutrition Goals

    func testDecodesNutritionGoalResponseWithGoal() throws {
        let json = """
        {
          "goal": {
            "id": "goal-1",
            "dailyEnergyKcal": 2200,
            "proteinG": 140,
            "carbsG": 220,
            "fatG": 70,
            "fiberG": 30,
            "effectiveFrom": "2026-01-01",
            "effectiveTo": null,
            "consentAt": "2026-01-01T00:00:00Z",
            "createdAt": "2026-01-01T00:00:00Z"
          }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(NutritionGoalResponse.self, from: json)
        let goal = try XCTUnwrap(response.goal)
        XCTAssertEqual(goal.id, "goal-1")
        XCTAssertEqual(goal.dailyEnergyKcal, 2200)
        XCTAssertEqual(goal.fiberG, 30)
        XCTAssertNil(goal.effectiveTo)
        XCTAssertTrue(goal.hasAnyTarget)
    }

    func testDecodesNutritionGoalResponseWithNullGoal() throws {
        let json = Data(#"{"goal": null}"#.utf8)
        let response = try decoder.decode(NutritionGoalResponse.self, from: json)
        XCTAssertNil(response.goal)
    }

    func testHasAnyTargetIsFalseWhenAllNutrientsNil() throws {
        let json = """
        {
          "id": "goal-2",
          "dailyEnergyKcal": null,
          "proteinG": null,
          "carbsG": null,
          "fatG": null,
          "fiberG": null,
          "effectiveFrom": "2026-01-01",
          "effectiveTo": null,
          "consentAt": null,
          "createdAt": "2026-01-01T00:00:00Z"
        }
        """.data(using: .utf8)!
        let goal = try decoder.decode(NutritionGoal.self, from: json)
        XCTAssertFalse(goal.hasAnyTarget)
    }

    func testEncodesNutritionGoalUpsertRequestOmittingNilFields() throws {
        let request = NutritionGoalUpsertRequest(
            dailyEnergyKcal: 2000,
            proteinG: nil,
            carbsG: nil,
            fatG: nil,
            fiberG: nil,
            effectiveFrom: "2026-01-01"
        )
        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertTrue(json.contains("\"dailyEnergyKcal\":2000"))
        XCTAssertFalse(json.contains("consent"))
        XCTAssertFalse(json.contains("proteinG"))
    }

    func testDecodesVersionedNutritionConsentStatus() throws {
        let json = Data(
            """
            {
              "ok": true,
              "consents": [{
                "purpose": "intake",
                "state": "active",
                "consentId": "consent-1",
                "grantedAt": "2026-08-09T12:00:00Z",
                "withdrawnAt": null,
                "statement": {
                  "purpose": "intake",
                  "policyVersion": "2026-08-09",
                  "statementVersion": "intake-2026-08-09.1",
                  "text": "Full statement",
                  "sha256": "\(String(repeating: "a", count: 64))",
                  "privacyNoticeVersion": "2026-08-09"
                }
              }]
            }
            """.utf8
        )
        let response = try decoder.decode(NutritionPrivacyResponse.self, from: json)
        XCTAssertEqual(response.consents.first?.purpose, .intake)
        XCTAssertEqual(response.consents.first?.state, .active)
        XCTAssertEqual(response.consents.first?.statement.statementVersion, "intake-2026-08-09.1")
    }

    func testDecodesNutritionGoalClearResponseWithBoolCleared() throws {
        let json = Data(#"{"cleared": true, "goal": null}"#.utf8)
        let response = try decoder.decode(NutritionGoalClearResponse.self, from: json)
        XCTAssertTrue(response.cleared)
        XCTAssertNil(response.goal)
    }

    /// Legacy / mistaken server payloads returned the open-goal count as an Int.
    func testDecodesNutritionGoalClearResponseWithNumericCleared() throws {
        let json = Data(#"{"cleared": 1, "goal": null}"#.utf8)
        let response = try decoder.decode(NutritionGoalClearResponse.self, from: json)
        XCTAssertTrue(response.cleared)
    }

    func testDecodesNutritionGoalClearResponseWithZeroCleared() throws {
        let json = Data(#"{"cleared": 0, "goal": null}"#.utf8)
        let response = try decoder.decode(NutritionGoalClearResponse.self, from: json)
        XCTAssertFalse(response.cleared)
    }

    // MARK: - Nutrition Summary

    func testDecodesNutritionSummaryWithDaysAndGoal() throws {
        let json = """
        {
          "from": "2026-01-01",
          "to": "2026-01-02",
          "totals": { "energyKcal": 3800, "proteinG": 190, "carbsG": 420, "fatG": 130 },
          "days": [
            { "date": "2026-01-01", "energyKcal": 1800, "proteinG": 90, "carbsG": 200, "fatG": 60, "coverageAvg": 0.8, "entryCount": 3 },
            { "date": "2026-01-02", "energyKcal": 2000, "proteinG": 100, "carbsG": 220, "fatG": 70, "coverageAvg": 0.9, "entryCount": 2 }
          ],
          "goal": {
            "dailyEnergyKcal": 2000, "proteinG": 120, "carbsG": 250, "fatG": 70, "fiberG": 30,
            "effectiveFrom": "2026-01-01", "effectiveTo": null
          }
        }
        """.data(using: .utf8)!

        let summary = try decoder.decode(NutritionSummary.self, from: json)
        XCTAssertEqual(summary.days.count, 2)
        XCTAssertEqual(summary.totals.energyKcal, 3800)
        XCTAssertEqual(summary.goal?.fiberG, 30)
        XCTAssertEqual(summary.days.map(\.id), ["2026-01-01", "2026-01-02"])
    }

    func testDecodesNutritionSummaryWithNullGoalAndEmptyDays() throws {
        let json = """
        {
          "from": "2026-01-01",
          "to": "2026-01-01",
          "totals": { "energyKcal": 0, "proteinG": 0, "carbsG": 0, "fatG": 0 },
          "days": [],
          "goal": null
        }
        """.data(using: .utf8)!
        let summary = try decoder.decode(NutritionSummary.self, from: json)
        XCTAssertTrue(summary.days.isEmpty)
        XCTAssertNil(summary.goal)
    }

    // MARK: - Cook

    func testDecodesCookEntriesResponseSuccess() throws {
        let json = """
        {
          "cooked": 2,
          "entryIds": ["e1", "e2"],
          "alreadyCookedIds": [],
          "partialCook": false,
          "undoToken": "tok-123",
          "deductions": []
        }
        """.data(using: .utf8)!
        let response = try decoder.decode(CookEntriesResponse.self, from: json)
        XCTAssertEqual(response.cooked, 2)
        XCTAssertEqual(response.entryIds, ["e1", "e2"])
        XCTAssertEqual(response.undoToken, "tok-123")
        XCTAssertNil(response.requiresConfirmation)
    }

    func testDecodesCookEntriesResponseRequiringConfirmation() throws {
        let json = """
        {
          "cooked": 0,
          "requiresConfirmation": true,
          "missingIngredients": [
            { "name": "flour", "required": 2, "available": 0.5, "unit": "cup" }
          ],
          "alreadyCookedIds": []
        }
        """.data(using: .utf8)!
        let response = try decoder.decode(CookEntriesResponse.self, from: json)
        XCTAssertEqual(response.cooked, 0)
        XCTAssertEqual(response.requiresConfirmation, true)
        XCTAssertEqual(response.missingIngredients?.first?.name, "flour")
    }

    func testDecodesGalleyCookMealResponseWithManifestBridge() throws {
        let json = """
        {
          "cooked": true,
          "ingredientsDeducted": 1,
          "servings": 2,
          "bridgedToManifest": true,
          "offerPersonalLog": true,
          "autoCreated": true,
          "planId": "plan-1",
          "entry": {
            "id": "entry-1",
            "planId": "plan-1",
            "mealId": "meal-1",
            "date": "2026-08-09",
            "slotType": "dinner",
            "mealName": "Pasta",
            "mealServings": 2,
            "mealType": "recipe",
            "mealEnergyKcalPerServing": 400,
            "cookedAt": "2026-08-09T18:00:00.000Z",
            "consumedAt": "2026-08-09T18:00:00.000Z"
          },
          "undoToken": "tok-bridge"
        }
        """.data(using: .utf8)!
        let response = try decoder.decode(CookMealResponse.self, from: json)
        XCTAssertEqual(response.cooked, true)
        XCTAssertEqual(response.bridgedToManifest, true)
        XCTAssertEqual(response.offerPersonalLog, true)
        XCTAssertEqual(response.entry?.id, "entry-1")
        XCTAssertEqual(response.entry?.mealEnergyKcalPerServing, 400)
        XCTAssertEqual(response.undoToken, "tok-bridge")
    }

    // MARK: - Eat (intake)

    func testDecodesManifestIntakeUpsertResponse() throws {
        let json = """
        {
          "intake": {
            "id": "intake-1",
            "servings": 1.5,
            "energyKcal": 450,
            "proteinG": 30,
            "carbsG": 40,
            "fatG": 15,
            "occurredAt": "2026-01-01T12:00:00Z"
          },
          "idempotent": false,
          "replaced": false,
          "intakeConsentGranted": true,
          "undoToken": "tok-456"
        }
        """.data(using: .utf8)!
        let response = try decoder.decode(ManifestIntakeUpsertResponse.self, from: json)
        XCTAssertEqual(response.intake.servings, 1.5)
        XCTAssertEqual(response.intake.energyKcal, 450)
        XCTAssertEqual(response.intakeConsentGranted, true)
        XCTAssertFalse(response.idempotent)
    }

    func testDecodesManifestIntakeClearResponse() throws {
        let json = Data(#"{"cleared": true, "voidedIntakeId": "intake-1", "undoToken": "tok-789"}"#.utf8)
        let response = try decoder.decode(ManifestIntakeClearResponse.self, from: json)
        XCTAssertTrue(response.cleared)
        XCTAssertEqual(response.voidedIntakeId, "intake-1")
    }

    func testEncodesManifestIntakeUpsertRequest() throws {
        let request = ManifestIntakeUpsertRequest(servings: 2.0, idempotencyKey: "key-1")
        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertTrue(json.contains("\"servings\":2"))
        XCTAssertTrue(json.contains("\"idempotencyKey\":\"key-1\""))
        XCTAssertFalse(json.contains("consent"))
        XCTAssertFalse(json.contains("consent"))
    }

    // MARK: - ManifestEntry cook/eat fields

    func testManifestEntryIsCookedFallsBackToLegacyConsumedAt() throws {
        let json = """
        {
          "id": "entry-1", "planId": "plan-1", "mealId": "meal-1", "date": "2026-01-01",
          "slotType": "dinner", "orderIndex": 0, "servingsOverride": null, "notes": null,
          "consumedAt": "2026-01-01T18:00:00Z", "createdAt": "2026-01-01T00:00:00Z",
          "mealName": "Chili", "mealServings": 4, "mealType": "recipe",
          "mealPrepTime": null, "mealCookTime": null
        }
        """.data(using: .utf8)!
        let entry = try decoder.decode(ManifestEntry.self, from: json)
        XCTAssertNil(entry.cookedAt)
        XCTAssertTrue(entry.isCooked)
        XCTAssertNil(entry.personalIntake)
    }

    func testManifestEntryDecodesCookedAtAndPersonalIntake() throws {
        let json = """
        {
          "id": "entry-2", "planId": "plan-1", "mealId": "meal-1", "date": "2026-01-01",
          "slotType": "lunch", "orderIndex": 0, "servingsOverride": null, "notes": null,
          "consumedAt": "2026-01-01T13:00:00Z", "cookedAt": "2026-01-01T12:30:00Z",
          "createdAt": "2026-01-01T00:00:00Z",
          "mealName": "Soup", "mealServings": 2, "mealType": "recipe",
          "mealPrepTime": null, "mealCookTime": null,
          "mealEnergyKcalPerServing": 320,
          "mealProteinGPerServing": 20,
          "mealCarbsGPerServing": 30,
          "mealFatGPerServing": 10,
          "personalIntake": {
            "id": "intake-9", "servings": 1, "energyKcal": 320, "proteinG": 20, "carbsG": 30, "fatG": 10,
            "occurredAt": "2026-01-01T13:05:00Z"
          }
        }
        """.data(using: .utf8)!
        let entry = try decoder.decode(ManifestEntry.self, from: json)
        XCTAssertNotNil(entry.cookedAt)
        XCTAssertEqual(entry.mealEnergyKcalPerServing, 320)
        XCTAssertEqual(entry.mealProteinGPerServing, 20)
        XCTAssertEqual(entry.mealCarbsGPerServing, 30)
        XCTAssertEqual(entry.mealFatGPerServing, 10)
        XCTAssertEqual(entry.personalIntake?.id, "intake-9")
    }

    // MARK: - Cargo / Meal nutrition snapshots

    func testDecodesCargoNutritionSnapshot() throws {
        let json = """
        {
          "source": "usda",
          "confidence": 0.9,
          "verified": true,
          "per100g": { "energyKcal": 52, "proteinG": 0.3, "fatG": 0.2, "carbG": 14 },
          "perServing": { "energyKcal": 95, "proteinG": 0.5, "fatG": 0.3, "carbG": 25, "fiberG": 4 },
          "fdcId": 171688,
          "description": "Apples, raw"
        }
        """.data(using: .utf8)!
        let snap = try decoder.decode(NutritionSnapshot.self, from: json)
        XCTAssertEqual(snap.source, "usda")
        XCTAssertEqual(snap.provenanceLabel, "USDA")
        XCTAssertEqual(snap.displayNutrients?.energyKcal, 95)
        XCTAssertEqual(snap.displayNutrients?.carbG, 25)
    }

    func testDecodesMealNutritionSnapshot() throws {
        let json = """
        {
          "perServing": { "energyKcal": 450, "proteinG": 28, "fatG": 12, "carbG": 40 },
          "coverage": 0.85,
          "computedAt": "2026-01-01T12:00:00Z"
        }
        """.data(using: .utf8)!
        let snap = try decoder.decode(MealNutritionSnapshot.self, from: json)
        XCTAssertEqual(snap.coverage, 0.85)
        XCTAssertEqual(snap.displayNutrients?.proteinG, 28)
    }

    func testApplyingMacrosMarksUserOverride() {
        let usda = NutritionSnapshot(
            source: "usda",
            confidence: 0.8,
            verified: false,
            per100g: nil,
            perServing: NutrientValues(energyKcal: 100, proteinG: 5, fatG: 2, carbG: 10),
            fdcId: 9,
            description: "Milk"
        )
        let edited = usda.applyingMacros(energyKcal: 110)
        XCTAssertEqual(edited.source, "user_override")
        XCTAssertEqual(edited.verified, true)
        XCTAssertNil(edited.per100g)
        XCTAssertEqual(edited.perServing?.energyKcal, 110)
        XCTAssertEqual(edited.perServing?.proteinG, 5)
        XCTAssertEqual(edited.fdcId, 9)
    }

    func testDecodesNutritionResolveResponseWithNullSnapshot() throws {
        let json = Data(#"{"snapshots":{"milk":null,"apple":{"source":"usda","confidence":1,"verified":true,"per100g":null,"perServing":{"energyKcal":52,"proteinG":0.3,"fatG":0.2,"carbG":14},"fdcId":1,"description":null}}}"#.utf8)
        let response = try decoder.decode(NutritionResolveResponse.self, from: json)
        XCTAssertEqual(response.snapshots.count, 2)
        guard let milkEntry = response.snapshots["milk"] else {
            return XCTFail("Expected milk key")
        }
        XCTAssertNil(milkEntry)
        guard let appleEntry = response.snapshots["apple"] else {
            return XCTFail("Expected apple key")
        }
        XCTAssertEqual(appleEntry?.displayNutrients?.energyKcal, 52)
    }
}
