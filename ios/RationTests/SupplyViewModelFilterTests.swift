import XCTest
@testable import Ration

@MainActor
final class SupplyViewModelFilterTests: XCTestCase {
    func testDisplayedItemsRespectsSearchAndHidePurchased() {
        let model = SupplyViewModel()
        model.setListForTesting(SupplyList(
            id: "list-1",
            name: "Supply",
            items: [
                SupplyItem(id: "1", name: "Milk", quantity: 1, unit: "l", domain: "food", isPurchased: false, sourceOrigins: []),
                SupplyItem(id: "2", name: "Butter", quantity: 1, unit: "pack", domain: "food", isPurchased: true, sourceOrigins: []),
                SupplyItem(id: "3", name: "Soap", quantity: 1, unit: "unit", domain: "home", isPurchased: false, sourceOrigins: []),
            ]
        ))
        model.filters.hidePurchased = true
        model.filters.search = "mil"
        XCTAssertEqual(model.displayedItems.map(\.id), ["1"])
        XCTAssertEqual(model.purchasedCount, 1)
        XCTAssertEqual(model.totalCount, 3)
        XCTAssertFalse(model.showsFilteredEmptyState)
    }

    func testShowsFilteredEmptyStateWhenFiltersExcludeAll() {
        let model = SupplyViewModel()
        model.setListForTesting(SupplyList(
            id: "list-1",
            name: "Supply",
            items: [
                SupplyItem(id: "1", name: "Milk", quantity: 1, unit: "l", domain: "food", isPurchased: false, sourceOrigins: []),
            ]
        ))
        model.filters.search = "zzz"
        XCTAssertTrue(model.showsFilteredEmptyState)
        XCTAssertEqual(model.progressFraction, 0)
    }
}
