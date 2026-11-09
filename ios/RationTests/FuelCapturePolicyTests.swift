import XCTest
@testable import Ration

final class FuelCapturePolicyTests: XCTestCase {
    func testOneControlAndTwoLabels() {
        XCTAssertEqual(HubCapturePolicy.controlCount, 1)
        XCTAssertEqual(HubCapturePolicy.choiceLabels, ["Add to Cargo", "Log to Fuel"])
        let banned = ["Copilot", "Scan items", "Log food", "I ate this"]
        for label in HubCapturePolicy.choiceLabels {
            XCTAssertFalse(banned.contains(label))
        }
    }

    func testFlagOffKeepsScanAndGoals() {
        XCTAssertFalse(HubCapturePolicy.choiceVisible(fastLogEnabled: false, appVersion: "1.6.0"))
        XCTAssertTrue(HubCapturePolicy.dailyFuelOpensGoals(fastLogEnabled: false, appVersion: "1.6.0"))
        XCTAssertTrue(HubCapturePolicy.dailyFuelOpensGoals(fastLogEnabled: false, appVersion: "1.5.15"))
    }

    func testIOS15StaysClosedEvenWhenTheFlagIsOn() {
        XCTAssertFalse(HubCapturePolicy.choiceVisible(fastLogEnabled: true, appVersion: "1.5.15"))
        XCTAssertFalse(HubCapturePolicy.choiceVisible(fastLogEnabled: true, appVersion: "1.5.16"))
        XCTAssertTrue(HubCapturePolicy.dailyFuelOpensGoals(fastLogEnabled: true, appVersion: "1.5.15"))
    }

    func testIOS16FlagOnOpensTheChoiceAndTheDay() {
        XCTAssertTrue(HubCapturePolicy.choiceVisible(fastLogEnabled: true, appVersion: "1.6.0"))
        XCTAssertFalse(HubCapturePolicy.dailyFuelOpensGoals(fastLogEnabled: true, appVersion: "1.6.0"))
    }

    func testRetryKeepsOneOperationKey() {
        XCTAssertEqual(LogToFuelDraft.operationKey(existing: "same", mint: { "new" }), "same")
        XCTAssertEqual(LogToFuelDraft.operationKey(existing: nil, mint: { "new" }), "new")
        XCTAssertEqual(LogToFuelDraft.operationKey(existing: "", mint: { "new" }), "new")
    }
}
