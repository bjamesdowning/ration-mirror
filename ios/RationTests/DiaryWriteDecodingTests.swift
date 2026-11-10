import XCTest
@testable import Ration

final class DiaryWriteDecodingTests: XCTestCase {
    private let success = Data(
        """
        {"operationId":"11111111-1111-4111-8111-111111111111","intakeId":"22222222-2222-4222-8222-222222222222","replayed":false,"credits":0,"kitchenOffer":{"cargo":true,"galley":true},"manifestDate":"2026-11-09","entryId":null}
        """.utf8
    )

    private let errorEnvelope = Data(
        """
        {"error":"Confirm the intake notice before logging food.","code":"nutrition_consent_required"}
        """.utf8
    )

    func testSuccessBodyIsASavedIntake() throws {
        let response = try JSON.decoder.decode(DiaryWriteResponse.self, from: success)
        XCTAssertEqual(response.outcome, .saved("22222222-2222-4222-8222-222222222222"))
        XCTAssertEqual(response.credits, 0)
        XCTAssertEqual(response.replayed, false)
        XCTAssertNil(APIClient.serverMessage(in: success))
    }

    func testErrorEnvelopeIsRejectedInsteadOfASave() throws {
        let response = try JSON.decoder.decode(DiaryWriteResponse.self, from: errorEnvelope)
        XCTAssertEqual(
            response.outcome,
            .rejected("Confirm the intake notice before logging food.")
        )
        XCTAssertEqual(
            APIClient.serverMessage(in: errorEnvelope),
            "Confirm the intake notice before logging food."
        )
    }

    func testFractionalCreditsStillDecodeWhenTheIntakeIdIsPresent() throws {
        let body = Data(
            """
            {"intakeId":"22222222-2222-4222-8222-222222222222","replayed":false,"credits":1.2}
            """.utf8
        )
        let response = try JSON.decoder.decode(DiaryWriteResponse.self, from: body)
        XCTAssertEqual(response.credits, 1)
        XCTAssertEqual(response.outcome, .saved("22222222-2222-4222-8222-222222222222"))
    }

    func testSavedFoodRowAcceptsTheNumericBodyAndRejectsAnErrorEnvelope() throws {
        let row = Data(
            """
            {"id":"33333333-3333-4333-8333-333333333333","name":"Yogurt","energyKcal":100,"proteinG":12,"carbsG":11,"fatG":10,"fiberG":null,"defaultAmount":1,"defaultUnit":"serving"}
            """.utf8
        )
        let saved = try JSON.decoder.decode(SavedFoodRow.self, from: row)
        XCTAssertEqual(saved.energyKcal, 100)
        XCTAssertEqual(saved.proteinG, 12)
        XCTAssertEqual(saved.carbsG, 11)
        XCTAssertEqual(saved.fatG, 10)
        XCTAssertThrowsError(try JSON.decoder.decode(SavedFoodRow.self, from: errorEnvelope))
        XCTAssertEqual(
            APIClient.serverMessage(in: errorEnvelope),
            "Confirm the intake notice before logging food."
        )
    }

    func testSavedFoodRowAcceptsNumericStrings() throws {
        let row = Data(
            """
            {"id":"33333333-3333-4333-8333-333333333333","name":"Yogurt","energyKcal":"100","proteinG":"12","carbsG":"11","fatG":"10","defaultAmount":null,"defaultUnit":"serving"}
            """.utf8
        )
        let saved = try JSON.decoder.decode(SavedFoodRow.self, from: row)
        XCTAssertEqual(saved.energyKcal, 100)
        XCTAssertEqual(saved.fatG, 10)
        XCTAssertNil(saved.defaultAmount)
    }

    func testPhotoDraftIsRawBase64() {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
        let encoded = FuelPhoto.jpegBase64(image)
        XCTAssertNotNil(encoded)
        XCTAssertFalse(encoded?.contains(",") ?? true)
        XCTAssertFalse(encoded?.hasPrefix("data:") ?? true)
    }
}
