import XCTest
@testable import Ration

final class SavedListViewModelTests: XCTestCase {
    func testFirstTapAddsWithMissingOnly() {
        let action = SavedListLogic.tap(liveState: nil)
        XCTAssertEqual(action, .add)
        XCTAssertEqual(SavedListLogic.copyMode(for: action), "missing_only")
    }

    func testSecondTapOpensMenuAndDoesNotSendAddAll() {
        let onLive = SavedListLogic.tap(liveState: "on_live")
        let inCart = SavedListLogic.tap(liveState: "in_cart")
        XCTAssertEqual(onLive, .menu)
        XCTAssertEqual(inCart, .menu)
        XCTAssertNil(SavedListLogic.copyMode(for: onLive))
        XCTAssertNotEqual(SavedListLogic.copyMode(for: onLive), "add_all")
    }

    func testUndoToastClearsAddedCounts() {
        let counts = SupplyAddToLiveCounts(
            added: 1,
            merged: 0,
            skippedOnLive: 0,
            skippedInCart: 0,
            skippedInCargo: 0
        )
        XCTAssertEqual(SavedListLogic.toast(for: counts, name: "Milk"), "Added Milk to Live")
        let undone = SupplyAddToLiveCounts(
            added: 0,
            merged: 0,
            skippedOnLive: 0,
            skippedInCart: 0,
            skippedInCargo: 0
        )
        XCTAssertEqual(SavedListLogic.toast(for: undone), "Nothing new to add")
    }
}
