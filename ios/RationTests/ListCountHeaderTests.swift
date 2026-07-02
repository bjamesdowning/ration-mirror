import XCTest
@testable import Ration

final class ListCountHeaderTests: XCTestCase {
    func testFormatZero() {
        XCTAssertEqual(ListCountLabel.format(0), "0 items")
    }

    func testFormatPositive() {
        XCTAssertEqual(ListCountLabel.format(42), "42 items")
    }

    func testAccessibilityLabelMatchesFormat() {
        XCTAssertEqual(ListCountLabel.accessibilityLabel(7), "7 items")
    }
}
