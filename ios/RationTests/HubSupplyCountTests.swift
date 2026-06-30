import XCTest
@testable import Ration

final class HubSupplyCountTests: XCTestCase {
    func testDecodesHubSupplyMetadata() throws {
        let json = """
        {
          "id": "list_1",
          "name": "Supply",
          "items": [],
          "itemCount": 25,
          "uncheckedCount": 20,
          "purchasedCount": 5
        }
        """.data(using: .utf8)!

        let list = try JSON.decoder.decode(SupplyList.self, from: json)
        XCTAssertEqual(list.resolvedItemCount, 25)
        XCTAssertEqual(list.resolvedUncheckedCount, 20)
        XCTAssertEqual(list.resolvedPurchasedCount, 5)
    }

    func testWithItemPurchaseStateUpdatesCounts() {
        let list = SupplyList(
            id: "l1",
            name: "S",
            items: [
                SupplyItem(id: "i1", name: "milk", quantity: 1, unit: "L", domain: "food", isPurchased: false),
            ],
            itemCount: 10,
            uncheckedCount: 8,
            purchasedCount: 2
        )
        let updated = list.withItemPurchaseState("i1", isPurchased: true)
        XCTAssertEqual(updated.resolvedUncheckedCount, 7)
        XCTAssertEqual(updated.resolvedPurchasedCount, 3)
    }
}
