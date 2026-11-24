import XCTest
@testable import Ration

final class FuelCapturePolicyTests: XCTestCase {
    func testOneControlAndHubLabels() {
        XCTAssertEqual(HubCapturePolicy.controlCount, 1)
        XCTAssertEqual(
            HubCapturePolicy.choiceLabels,
            ["Log to Fuel", "Scan to Cargo", "Generate Meal", "Plan Week", "Dock from Receipt"]
        )
        let banned = ["Copilot", "Scan items", "Log food", "I ate this", "Add to Cargo"]
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

}
