import XCTest
@testable import Ration

final class CheckOffPresentationItemTests: XCTestCase {
    func testPresentationIdChangesWhenPurchasedStateChanges() {
        let item = SupplyItem(
            id: "item-1",
            name: "Milk",
            quantity: 1,
            unit: "L",
            domain: "food",
            isPurchased: false
        )
        let before = CheckOffPresentationItem(item: item)
        let after = CheckOffPresentationItem(
            item: SupplyItem(
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                domain: item.domain,
                isPurchased: true
            )
        )
        XCTAssertNotEqual(before.id, after.id)
    }
}
