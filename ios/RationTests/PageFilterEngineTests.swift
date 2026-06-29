import XCTest
@testable import Ration

final class PageFilterEngineTests: XCTestCase {
    private func cargoItem(name: String, domain: String = "food", tags: [String] = []) -> CargoItem {
        let tagsJSON: String
        if tags.isEmpty {
            tagsJSON = "[]"
        } else {
            tagsJSON = "[" + tags.map { "\"\($0)\"" }.joined(separator: ",") + "]"
        }
        let json = """
        {
          "id": "id_\(name.replacingOccurrences(of: " ", with: "_"))",
          "organizationId": "org_1",
          "name": "\(name)",
          "quantity": 1,
          "unit": "unit",
          "tags": \(tagsJSON),
          "domain": "\(domain)",
          "status": "stable",
          "expiresAt": null,
          "createdAt": "2026-06-29T12:00:00.000Z",
          "updatedAt": "2026-06-29T12:00:00.000Z"
        }
        """
        return try! JSON.decoder.decode(CargoItem.self, from: json.data(using: .utf8)!)
    }

    func testFilterCargoByDomain() {
        let items = [
            cargoItem(name: "rice", domain: "food"),
            cargoItem(name: "soap", domain: "household"),
        ]
        let filtered = PageFilterEngine.filterCargo(items, domain: .food, tag: nil, search: "")
        XCTAssertEqual(filtered.count, 1)
        XCTAssertEqual(filtered[0].name, "rice")
    }

    func testFilterCargoByTag() {
        let items = [
            cargoItem(name: "rice", tags: ["pantry"]),
            cargoItem(name: "milk", tags: ["dairy"]),
        ]
        let filtered = PageFilterEngine.filterCargo(items, domain: nil, tag: "pantry", search: "")
        XCTAssertEqual(filtered.map(\.name), ["rice"])
    }

    func testFilterCargoBySearch() {
        let items = [cargoItem(name: "brown rice"), cargoItem(name: "salt")]
        let filtered = PageFilterEngine.filterCargo(items, domain: nil, tag: nil, search: "rice")
        XCTAssertEqual(filtered.count, 1)
        XCTAssertEqual(filtered[0].name, "brown rice")
    }

    func testSortSupplyUnpurchasedFirst() {
        let items = [
            SupplyItem(id: "1", name: "milk", quantity: 1, unit: "L", domain: "food", isPurchased: true),
            SupplyItem(id: "2", name: "eggs", quantity: 12, unit: "unit", domain: "food", isPurchased: false),
        ]
        let sorted = PageFilterEngine.sortSupplyItems(items, sortMode: .unpurchased)
        XCTAssertEqual(sorted.first?.name, "eggs")
    }

    func testFilterSupplyHidePurchased() {
        let items = [
            SupplyItem(id: "1", name: "milk", quantity: 1, unit: "L", domain: "food", isPurchased: true),
            SupplyItem(id: "2", name: "eggs", quantity: 12, unit: "unit", domain: "food", isPurchased: false),
        ]
        let filtered = PageFilterEngine.filterSupplyItems(items, sortMode: .alpha, hidePurchased: true)
        XCTAssertEqual(filtered.count, 1)
        XCTAssertEqual(filtered[0].name, "eggs")
    }
}
