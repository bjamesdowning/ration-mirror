import XCTest
@testable import Ration

final class ConnectedMealsPresentationTests: XCTestCase {
    func testConnectionTypeLabelDirect() {
        XCTAssertEqual(ConnectedMealsPresentation.connectionTypeLabel("direct"), "Direct Link")
    }

    func testConnectionTypeLabelNameMatch() {
        XCTAssertEqual(ConnectedMealsPresentation.connectionTypeLabel("name_match"), "Name Match")
    }

    func testSortAlphabetical() {
        let meals = [
            makeMeal(id: "b", name: "Zucchini"),
            makeMeal(id: "a", name: "Apple"),
        ]
        let sorted = ConnectedMealsPresentation.sort(meals, by: .alphabetical)
        XCTAssertEqual(sorted.map(\.name), ["Apple", "Zucchini"])
    }

    func testCoverageLabelWhenSufficientOnHand() {
        let label = ConnectedMealsPresentation.coverageLabel(
            needed: 1,
            onHand: 2,
            unit: "lb",
            onHandUnit: "lb",
            ingredientName: "chicken",
            mode: .original
        )
        XCTAssertTrue(label.contains("have 2"))
        XCTAssertTrue(label.contains("needed"))
    }

    func testCoverageLabelSkipsOnHandWhenUnitsDiffer() {
        let label = ConnectedMealsPresentation.coverageLabel(
            needed: 2,
            onHand: 5,
            unit: "tbsp",
            onHandUnit: "lb",
            ingredientName: "butter",
            mode: .original
        )
        XCTAssertEqual(label, "2.00 tbsp needed")
        XCTAssertFalse(label.contains("have"))
    }

    func testUnitsMatchIgnoresCaseAndWhitespace() {
        XCTAssertTrue(ConnectedMealsPresentation.unitsMatch(" LB ", "lb"))
    }

    private func makeMeal(id: String, name: String) -> ConnectedCargoMeal {
        ConnectedCargoMeal(
            id: id,
            name: name,
            type: "recipe",
            description: nil,
            tags: [],
            connectedIngredients: []
        )
    }
}
