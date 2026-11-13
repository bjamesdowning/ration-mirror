import XCTest
@testable import Ration

final class FuelActionPolicyTests: XCTestCase {
    func testCapOpensPurchaseAndKeepsEdit() {
        for action in [FuelCreateAction.add, .scan, .barcode] {
            XCTAssertEqual(
                FuelActionPolicy.decide(
                    action: action,
                    used: 3,
                    limit: 3,
                    isOnline: true,
                    cameraDenied: true
                ),
                .openPurchase
            )
        }
        XCTAssertTrue(FuelActionPolicy.canEditOrVoidExistingRow())
        XCTAssertEqual(FuelActionPolicy.counterLabel(used: 3, limit: 3), "3 of 3 meals logged")
        XCTAssertGreaterThanOrEqual(FuelActionPolicy.minimumHitTarget, 44)
    }

    func testOfflineDisablesCreates() {
        XCTAssertEqual(
            FuelActionPolicy.decide(
                action: .add,
                used: 0,
                limit: 3,
                isOnline: false,
                cameraDenied: false
            ),
            .disabledOffline
        )
    }

    func testCameraDeniedFallsBackOnlyUnderTheCap() {
        XCTAssertEqual(
            FuelActionPolicy.decide(
                action: .barcode,
                used: 2,
                limit: 3,
                isOnline: true,
                cameraDenied: true
            ),
            .openTypedBarcode
        )
        XCTAssertEqual(
            FuelActionPolicy.decide(
                action: .scan,
                used: 1,
                limit: 3,
                isOnline: true,
                cameraDenied: true
            ),
            .cameraOff
        )
    }

    func testPhotoLogOffDoesNotOpenTheCameraOrCrew() {
        XCTAssertEqual(
            FuelActionPolicy.decide(
                action: .scan,
                used: 3,
                limit: 3,
                isOnline: true,
                cameraDenied: false,
                photoLogEnabled: false
            ),
            .photoLogOff
        )
        XCTAssertEqual(
            FuelActionPolicy.decide(
                action: .add,
                used: 0,
                limit: 3,
                isOnline: true,
                cameraDenied: false,
                photoLogEnabled: false
            ),
            .openForm
        )
    }

    func testPhotoFailuresStaySpecific() {
        XCTAssertEqual(
            FuelPhotoFailureMapping.decide(
                APIError.server(status: 400, message: "Photo must be 3 MiB or smaller.", code: "photo_too_large")
            ),
            .message("Photo must be 3 MiB or smaller.")
        )
        XCTAssertEqual(
            FuelPhotoFailureMapping.decide(
                APIError.server(status: 403, message: "AI features need your OK.", code: "consent_required")
            ),
            .message("AI features need your OK.")
        )
        XCTAssertEqual(
            FuelPhotoFailureMapping.decide(
                APIError.server(status: 403, message: "This feature is temporarily unavailable.", code: "FEATURE_DISABLED")
            ),
            .message("Photo food log is unavailable.")
        )
        XCTAssertEqual(
            FuelPhotoFailureMapping.decide(
                APIError.server(status: 429, message: "Too many requests. Please try again later.", code: nil)
            ),
            .message("Too many requests. Please try again later.")
        )
        XCTAssertEqual(
            FuelPhotoFailureMapping.decide(
                APIError.server(status: 402, message: "Insufficient credits", code: "insufficient_credits")
            ),
            .credits
        )
        XCTAssertEqual(
            FuelPhotoFailureMapping.decide(
                APIError.server(status: 403, message: "Daily Fuel limit reached", code: "fuel_daily_limit")
            ),
            .crew
        )
    }

    func testApproveBodyCarriesTheEditedEstimateAndZone() throws {
        let body = DiaryFoodBody(
            name: "Soup",
            occurredAt: "2026-11-10T12:00:00Z",
            amount: 250,
            unit: "g",
            macros: DiaryMacrosBody(energyKcal: 120, proteinG: 4, carbsG: 10, fatG: 6),
            idempotencyKey: "key",
            operationKey: "key",
            compositionSource: "ai_estimate",
            fuelTimeZone: "Europe/Dublin"
        )
        let data = try JSONEncoder().encode(body)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["name"] as? String, "Soup")
        XCTAssertEqual(json["amount"] as? Double, 250)
        XCTAssertEqual(json["unit"] as? String, "g")
        XCTAssertEqual(json["compositionSource"] as? String, "ai_estimate")
        XCTAssertEqual(json["fuelTimeZone"] as? String, "Europe/Dublin")
        let macros = try XCTUnwrap(json["macros"] as? [String: Any])
        XCTAssertEqual(macros["energyKcal"] as? Double, 120)
        XCTAssertEqual(macros["proteinG"] as? Double, 4)
        XCTAssertEqual(macros["carbsG"] as? Double, 10)
        XCTAssertEqual(macros["fatG"] as? Double, 6)
    }

    func testCrewHasNoCapLabelCeiling() {
        XCTAssertEqual(
            FuelActionPolicy.decide(
                action: .add,
                used: 9,
                limit: nil,
                isOnline: true,
                cameraDenied: false
            ),
            .openForm
        )
    }
}
