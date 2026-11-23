import XCTest
@testable import Ration

final class CargoFabMenuTests: XCTestCase {
    func testScanSitsAboveManualAdd() {
        let actions = CargoFabMenu.actions(scanEnabled: true)
        XCTAssertEqual(actions, [.addItem, .scanItems])
        XCTAssertEqual(actions.first, .addItem)
        XCTAssertEqual(actions.last, .scanItems)
    }

    func testHiddenScanLeavesOnlyManualAdd() {
        XCTAssertEqual(CargoFabMenu.actions(scanEnabled: false), [.addItem])
    }
}
