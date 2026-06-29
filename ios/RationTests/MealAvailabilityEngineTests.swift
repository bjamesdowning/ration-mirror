import XCTest
@testable import Ration

final class MealAvailabilityEngineTests: XCTestCase {
    func testAvailableWhenSufficientCargo() {
        XCTAssertEqual(
            MealAvailabilityEngine.status(required: 2, available: 2),
            .available
        )
        XCTAssertEqual(
            MealAvailabilityEngine.status(required: 2, available: 5),
            .available
        )
    }

    func testPartialWhenSomeCargo() {
        XCTAssertEqual(
            MealAvailabilityEngine.status(required: 2, available: 1),
            .partial
        )
    }

    func testMissingWhenNoCargo() {
        XCTAssertEqual(
            MealAvailabilityEngine.status(required: 2, available: 0),
            .missing
        )
    }

    func testScaledQuantityDoublesServings() {
        let scaled = MealAvailabilityEngine.scaledQuantity(100, baseServings: 2, desiredServings: 4)
        XCTAssertEqual(scaled, 200)
    }
}
