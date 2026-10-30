import XCTest
@testable import Ration

final class ClientFlagsDecodingTests: XCTestCase {
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
