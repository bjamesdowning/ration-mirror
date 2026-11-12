import XCTest
@testable import Ration

final class FuelVoidResolutionTests: XCTestCase {
    func testVoidPayloadWithIntakeIdRemovesTheRow() throws {
        let body = Data(
            """
            {"intakeId":"intake-1","operationId":"op-1","replayed":false,"voided":true}
            """.utf8
        )
        let saved = try JSON.decoder.decode(DiaryWriteResponse.self, from: body)
        XCTAssertEqual(saved.operationId, "op-1")
        XCTAssertEqual(FuelVoidResolution.decide(intakeId: saved.intakeId), .remove)
    }

    func testHtmlBodyIsNotASuccessfulVoid() {
        XCTAssertThrowsError(
            try JSON.decoder.decode(DiaryWriteResponse.self, from: Data("<!doctype html>".utf8))
        )
        XCTAssertEqual(
            FuelVoidResolution.decide(APIError.decoding("html")),
            .keep(message: unexpected)
        )
    }

    func testIntakeIdRemovesTheRow() {
        XCTAssertEqual(FuelVoidResolution.decide(intakeId: "intake-1"), .remove)
        XCTAssertEqual(FuelVoidResolution.decide(intakeId: ""), .keep(message: unexpected))
        XCTAssertEqual(FuelVoidResolution.decide(intakeId: nil), .keep(message: unexpected))
    }

    func testNotFoundRemovesTheRow() {
        let missing = APIError.server(status: 404, message: "Diary food not found", code: "not_found")
        XCTAssertEqual(FuelVoidResolution.decide(missing), .remove)
        let coded = APIError.server(status: 200, message: "Diary food not found", code: "not_found")
        XCTAssertEqual(FuelVoidResolution.decide(coded), .remove)
    }

    func testClientErrorsLeaveTheRowAndShowTheServerMessage() {
        let confirm = APIError.server(
            status: 400,
            message: "Pass confirm:true before this kitchen or void write.",
            code: "confirmation_required"
        )
        let conflict = APIError.server(
            status: 409,
            message: "A concurrent nutrition write won; retry this operation key",
            code: "nutrition_write_conflict"
        )
        for error in [confirm, conflict] {
            XCTAssertEqual(
                FuelVoidResolution.decide(error),
                .keep(message: error.errorDescription ?? "")
            )
            XCTAssertNotEqual(error.errorDescription, "That log was not saved.")
        }
    }

    func testDailyLimitOpensPaywallAndLeavesTheRow() {
        let limit = APIError.server(
            status: 403,
            message: "Daily fuel log limit reached",
            code: "fuel_daily_limit"
        )
        XCTAssertEqual(FuelVoidResolution.decide(limit), .paywall)
    }

    func testUndecodedSuccessLeavesTheRow() {
        let error = APIError.decoding("diary write missing intakeId")
        XCTAssertEqual(FuelVoidResolution.decide(error), .keep(message: unexpected))
    }

    private var unexpected: String {
        APIError.decoding("diary write missing intakeId").errorDescription
            ?? "Unexpected response from server."
    }
}
