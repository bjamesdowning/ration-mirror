import XCTest
@testable import Ration

final class DetailOverflowOrderTests: XCTestCase {
    func testCargoPinsDeleteThenEdit() {
        XCTAssertEqual(
            CargoOverflowMenu.ordered(showsMarkEmpty: true),
            [.delete, .edit, .eat, .galley, .markEmpty, .supply]
        )
        XCTAssertEqual(
            CargoOverflowMenu.ordered(showsMarkEmpty: false),
            [.delete, .edit, .eat, .galley, .supply]
        )
    }

    func testMealPinsDeleteThenEdit() {
        XCTAssertEqual(
            MealOverflowMenu.ordered(),
            [.delete, .edit, .cook, .manifest, .supply]
        )
    }
}

final class HubActionMenuTests: XCTestCase {
    func testCanonicalOrder() {
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

    func testHiddenRowsStayOutWithoutReordering() {
        let labels = HubCapturePolicy.visibleLabels(
            HubCapturePolicy.Visibility(
                logToFuel: false,
                scanToCargo: true,
                generateMeal: true,
                planWeek: false,
                dockFromReceipt: true
            )
        )
        XCTAssertEqual(labels, ["Scan to Cargo", "Generate Meal", "Dock from Receipt"])
        XCTAssertTrue(
            HubCapturePolicy.menuActive(
                HubCapturePolicy.Visibility(scanToCargo: true)
            )
        )
        XCTAssertFalse(HubCapturePolicy.menuActive(HubCapturePolicy.Visibility()))
    }
}
