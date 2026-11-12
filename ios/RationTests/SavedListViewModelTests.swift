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

    func testNonIntegerSavedListQuantityDoesNotPrintRawDouble() {
        let raw = 13.129190700000002
        let text = SavedListLogic.formatAmount(raw, unit: "g")
        XCTAssertEqual(text, QuantityPresentation.formatNumber(raw, unit: "g"))
        XCTAssertEqual(text, "13")
        XCTAssertNotEqual(text, String(raw))
        XCTAssertFalse(text.contains("000002"))
        let item = SupplyItem(
            id: "1",
            name: "butter",
            quantity: raw,
            unit: "g",
            domain: "food",
            isPurchased: false,
            live: SavedListItemLive(
                state: "on_live",
                quantity: raw,
                unit: "g",
                manualOnly: nil,
                liveItemId: nil
            ),
            inCargo: raw
        )
        let line = SavedListLogic.statusLine(for: item, now: Date(timeIntervalSince1970: 0))
        XCTAssertFalse(line.contains("000002"))
        XCTAssertTrue(line.contains("In Cargo 13"))
        XCTAssertTrue(line.contains("On Live 13 g"))
    }
}
