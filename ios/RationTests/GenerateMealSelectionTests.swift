import XCTest
@testable import Ration

final class GenerateMealSelectionTests: XCTestCase {
    func testDefaultSelectionIncludesAllRecipeNames() {
        let recipeNames = ["Soup", "Salad"]
        let selected = Set(recipeNames)
        XCTAssertEqual(selected.count, 2)
        XCTAssertTrue(selected.contains("Soup"))
        XCTAssertTrue(selected.contains("Salad"))
    }
}
