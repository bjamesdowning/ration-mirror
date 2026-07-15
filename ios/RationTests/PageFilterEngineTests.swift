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
        let filtered = PageFilterEngine.filterCargo(items, domain: .food, tags: [], search: "")
        XCTAssertEqual(filtered.count, 1)
        XCTAssertEqual(filtered[0].name, "rice")
    }

    func testFilterCargoByTag() {
        let items = [
            cargoItem(name: "rice", tags: ["pantry"]),
            cargoItem(name: "milk", tags: ["dairy"]),
        ]
        let filtered = PageFilterEngine.filterCargo(items, domain: nil, tags: ["pantry"], search: "")
        XCTAssertEqual(filtered.map(\.name), ["rice"])
    }

    func testFilterCargoBySearch() {
        let items = [cargoItem(name: "brown rice"), cargoItem(name: "salt")]
        let filtered = PageFilterEngine.filterCargo(items, domain: nil, tags: [], search: "rice")
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

    func testFilterSupplyByDomain() {
        let items = [
            SupplyItem(id: "1", name: "rice", quantity: 1, unit: "kg", domain: "food", isPurchased: false),
            SupplyItem(id: "2", name: "soap", quantity: 1, unit: "unit", domain: "household", isPurchased: false),
        ]
        let filtered = PageFilterEngine.filterSupplyItems(
            items,
            domain: .household,
            sortMode: .alpha,
            hidePurchased: false
        )
        XCTAssertEqual(filtered.map(\.name), ["soap"])
    }

    func testFilterSupplyBySearch() {
        let items = [
            SupplyItem(id: "1", name: "brown rice", quantity: 1, unit: "kg", domain: "food", isPurchased: false),
            SupplyItem(id: "2", name: "salt", quantity: 1, unit: "unit", domain: "food", isPurchased: false),
        ]
        let filtered = PageFilterEngine.filterSupplyItems(
            items,
            search: "rice",
            sortMode: .alpha,
            hidePurchased: false
        )
        XCTAssertEqual(filtered.count, 1)
        XCTAssertEqual(filtered[0].name, "brown rice")
    }

    private func mealItem(name: String, tags: [String] = []) -> Meal {
        Meal(
            id: "meal_\(name)",
            organizationId: "org_1",
            name: name,
            domain: "food",
            type: "recipe",
            description: nil,
            directions: nil,
            equipment: nil,
            servings: 2,
            prepTime: nil,
            cookTime: nil,
            createdAt: Date(),
            updatedAt: Date(),
            tags: tags.map { Tag(slug: $0) },
            ingredients: []
        )
    }

    func testFilterMealsBySearch() {
        let meals = [mealItem(name: "potato salad"), mealItem(name: "pasta")]
        let filtered = PageFilterEngine.filterMeals(meals, domain: nil, tags: [], search: "potato")
        XCTAssertEqual(filtered.count, 1)
        XCTAssertEqual(filtered[0].name, "potato salad")
    }
}
