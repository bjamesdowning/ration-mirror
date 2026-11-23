import XCTest
@testable import Ration

final class AddFuelKitchenTests: XCTestCase {
    func testEmptySearchKeepsTheKitchenInTheMenu() {
        let picker = AddFuelKitchen.picker(
            query: "  ",
            selectedTags: [],
            cargoPage: [
                tagged("c1", "tomato"),
                tagged("c2", "cream cheese"),
            ],
            searchHits: [AddFuelKitchen.Hit(id: "hit", name: "ignored")],
            meals: [tagged("m1", "Autumn stew", ["Autumn"])]
        )
        XCTAssertFalse(picker.listsUnderSearch)
        XCTAssertEqual(picker.groupedNames, ["tomato", "cream cheese", "Autumn stew"])
    }

    func testOneCharacterFiltersNamesAndIgnoresSearchHits() {
        let picker = AddFuelKitchen.picker(
            query: "T",
            selectedTags: [],
            cargoPage: [
                tagged("c1", "tomato"),
                tagged("c2", "cream cheese"),
            ],
            searchHits: [AddFuelKitchen.Hit(id: "hit", name: "mozzarella")],
            meals: [
                tagged("m1", "tuna melt"),
                tagged("m2", "oatmeal"),
            ]
        )
        XCTAssertFalse(picker.listsUnderSearch)
        XCTAssertEqual(picker.cargo.map(\.name), ["tomato"])
        XCTAssertEqual(picker.meals.map(\.name), ["tuna melt", "oatmeal"])
    }

    func testTwoCharacterQueryUsesSearchHitsThenGalley() {
        let picker = AddFuelKitchen.picker(
            query: "to",
            selectedTags: [],
            cargoPage: [tagged("c1", "tomato")],
            searchHits: [
                AddFuelKitchen.Hit(id: "s1", name: "tomato paste"),
                AddFuelKitchen.Hit(id: "s2", name: "mozzarella"),
            ],
            meals: [
                tagged("m1", "tomato soup"),
                tagged("m2", "pesto"),
            ]
        )
        XCTAssertEqual(picker.groupedNames, ["tomato paste", "mozzarella", "tomato soup"])
    }

    func testTagKeepsMatchingCargoAndGalley() {
        let picker = AddFuelKitchen.picker(
            query: "",
            selectedTags: ["Autumn", "1 Pan"],
            cargoPage: [
                tagged("c1", "tomato", ["1 Pan"]),
                tagged("c2", "crackers", ["Ai Generated"]),
                tagged("c3", "pesto", ["Autumn"]),
            ],
            searchHits: [],
            meals: [
                tagged("m1", "stew", ["2 Pan"]),
                tagged("m2", "soup", ["Autumn", "2 Pan"]),
            ]
        )
        XCTAssertEqual(picker.cargo.map(\.id), ["c1", "c3"])
        XCTAssertEqual(picker.meals.map(\.id), ["m2"])
    }

    func testTaggedSearchDropsHitsMissingFromThePage() {
        let picker = AddFuelKitchen.picker(
            query: "zz",
            selectedTags: ["Autumn"],
            cargoPage: [
                tagged("on-page", "oatmeal", ["Autumn"]),
                tagged("other", "tuna", ["1 Pan"]),
            ],
            searchHits: [
                AddFuelKitchen.Hit(id: "missing", name: "mozzarella"),
                AddFuelKitchen.Hit(id: "on-page", name: "oatmeal"),
                AddFuelKitchen.Hit(id: "other", name: "tuna"),
            ],
            meals: []
        )
        XCTAssertEqual(picker.cargo.map(\.id), ["on-page"])
    }

    func testEachGroupStopsAtTwenty() {
        let cargo = (1...21).map { tagged("c\($0)", "item \($0)") }
        let meals = (1...21).map { tagged("m\($0)", "meal \($0)") }
        let picker = AddFuelKitchen.picker(
            query: "",
            selectedTags: [],
            cargoPage: cargo,
            searchHits: [],
            meals: meals
        )
        XCTAssertEqual(picker.cargo.count, 20)
        XCTAssertEqual(picker.meals.count, 20)
        XCTAssertEqual(picker.cargo.first?.id, "c1")
        XCTAssertEqual(picker.meals.first?.id, "m1")
    }

    private func tagged(_ id: String, _ name: String, _ tags: [String] = []) -> AddFuelKitchen.Tagged {
        AddFuelKitchen.Tagged(id: id, name: name, tagNames: tags)
    }
}
