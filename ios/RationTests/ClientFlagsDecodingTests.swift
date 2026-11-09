import XCTest
@testable import Ration

final class ClientFlagsDecodingTests: XCTestCase {
    func testNutritionFastLogFailsClosedWhenMissing() throws {
        XCTAssertFalse(try decode(#"{}"#).isNutritionGoalsEnabled)
        XCTAssertTrue(try decode(#"{"nutritionGoals":true}"#).isNutritionGoalsEnabled)
        XCTAssertFalse(try decode(#"{}"#).isNutritionFastLogEnabled)
        XCTAssertTrue(try decode(#"{"nutritionFastLog":true}"#).isNutritionFastLogEnabled)
        XCTAssertFalse(try decode(#"{"nutritionFastLog":true}"#).isNutritionSavedFoodEnabled)
        XCTAssertTrue(try decode(#"{"nutritionSavedFood":true}"#).isNutritionSavedFoodEnabled)
        XCTAssertFalse(try decode(#"{"nutritionFastLog":true}"#).isNutritionBarcodeDiaryEnabled)
        XCTAssertFalse(try decode(#"{"nutritionFastLog":true}"#).isNutritionPhotoLogEnabled)
        XCTAssertTrue(try decode(#"{"nutritionBarcodeDiary":true}"#).isNutritionBarcodeDiaryEnabled)
        XCTAssertTrue(try decode(#"{"nutritionPhotoLog":true}"#).isNutritionPhotoLogEnabled)
        XCTAssertFalse(try decode(#"{"nutritionFastLog":true}"#).isNutritionHealthExportEnabled)
        XCTAssertTrue(try decode(#"{"nutritionHealthExport":true}"#).isNutritionHealthExportEnabled)
    }

    func testMissingKeysFailClosed() throws {
        let flags = try decode(#"{}"#)
        XCTAssertFalse(flags.isRationCopilotEnabled)
        XCTAssertFalse(flags.isAiScanReceiptEnabled)
    }

    func testDockFromReceiptRequiresScanReceipt() throws {
        XCTAssertFalse(try decode(#"{"aiDockFromReceipt":true}"#).isAiDockFromReceiptEnabled)
        XCTAssertTrue(
            try decode(#"{"aiDockFromReceipt":true,"aiScanReceipt":true}"#).isAiDockFromReceiptEnabled
        )
    }

    /// The server still sends keys for features that are always on in this build.
    func testIgnoresKeysTheAppNoLongerReads() throws {
        let flags = try decode(#"{"supplyMultiLists":false,"nutritionEngine":false,"rationCopilot":true}"#)
        XCTAssertTrue(flags.isRationCopilotEnabled)
    }

    private func decode(_ json: String) throws -> ClientFlags {
        try JSONDecoder().decode(ClientFlags.self, from: Data(json.utf8))
    }
}
