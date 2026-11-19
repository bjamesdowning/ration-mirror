import XCTest
@testable import Ration

final class CargoMergePromptTests: XCTestCase {
    func testPromptMatchesTheWebChoice() {
        let candidate = CargoMergeCandidate(
            id: "cargo_tomato",
            name: "Cherry Tomato",
            quantity: 2,
            unit: "unit",
            score: 0.91,
            convertedQuantity: 1
        )

        XCTAssertEqual(CargoMergePrompt.title, "Potential duplicate found")
        XCTAssertEqual(CargoMergePrompt.addToExistingTitle, "Add to Existing")
        XCTAssertEqual(CargoMergePrompt.createNewTitle, "Create New Item")
        XCTAssertEqual(
            CargoMergePrompt.message(for: candidate),
            "Potential duplicate found: Cherry Tomato (2 unit). Add 1 unit to the existing item, or create a new row?"
        )
    }
}
