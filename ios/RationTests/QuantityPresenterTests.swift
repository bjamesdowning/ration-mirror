import XCTest
@testable import Ration

/// Golden cases mirrored from `app/lib/__fixtures__/quantity-presentation.json`.
final class QuantityPresenterTests: XCTestCase {
    func testMetricMilkStaysOnLiters() {
        let result = QuantityPresenter.presentResult(
            quantity: 1000,
            unit: "ml",
            ingredientName: "milk",
            mode: .metric
        )
        XCTAssertEqual(result.unit, "l")
        XCTAssertEqual(result.quantity, 1, accuracy: 0.01)
    }

    func testMetricOilStaysOnMilliliters() {
        let result = QuantityPresenter.presentResult(
            quantity: 500,
            unit: "ml",
            ingredientName: "olive oil",
            mode: .metric
        )
        XCTAssertEqual(result.unit, "ml")
        XCTAssertEqual(result.quantity, 500, accuracy: 0.01)
    }

    func testMetricFlourUsesKilograms() {
        let result = QuantityPresenter.presentResult(
            quantity: 1000,
            unit: "g",
            ingredientName: "flour",
            mode: .metric
        )
        XCTAssertEqual(result.unit, "kg")
        XCTAssertEqual(result.quantity, 1, accuracy: 0.01)
    }

    func testImperialFlourUsesPounds() {
        let result = QuantityPresenter.presentResult(
            quantity: 1000,
            unit: "g",
            ingredientName: "flour",
            mode: .imperial
        )
        XCTAssertEqual(result.unit, "lb")
        XCTAssertEqual(result.quantity, 2.20462, accuracy: 0.02)
    }

    func testImperialMilkUsesQuarts() {
        let result = QuantityPresenter.presentResult(
            quantity: 2000,
            unit: "ml",
            ingredientName: "milk",
            mode: .imperial
        )
        XCTAssertEqual(result.unit, "qt")
        XCTAssertEqual(result.quantity, 2.113, accuracy: 0.02)
    }

    func testOriginalPreservesAuthoredUnits() {
        let result = QuantityPresenter.presentResult(
            quantity: 1,
            unit: "kg",
            ingredientName: "flour",
            mode: .original
        )
        XCTAssertEqual(result.unit, "kg")
        XCTAssertEqual(result.quantity, 1, accuracy: 0.01)
    }

    func testMetricNeverProducesUSVolumeForLiquids() {
        for ml in [250.0, 500.0, 1000.0, 2000.0] {
            let result = QuantityPresenter.presentResult(
                quantity: ml,
                unit: "ml",
                ingredientName: "milk",
                mode: .metric
            )
            XCTAssertFalse(
                ["qt", "pt", "cup", "gal", "fl oz"].contains(result.unit),
                "metric \(ml) ml should not use US volume, got \(result.unit)"
            )
        }
    }
}
