import XCTest
@testable import Ration

final class CargoExpiryBandAccessibilityTests: XCTestCase {
    func testAccessibilityLabelsCoverVisibleBands() {
        XCTAssertNil(CargoExpiryBand.hidden.accessibilityLabel)
        XCTAssertEqual(CargoExpiryBand.green.accessibilityLabel, "fresh")
        XCTAssertEqual(CargoExpiryBand.yellow.accessibilityLabel, "expires soon")
        XCTAssertEqual(CargoExpiryBand.red.accessibilityLabel, "expires very soon")
        XCTAssertEqual(CargoExpiryBand.expired.accessibilityLabel, "expired")
    }
}
