import XCTest
@testable import Ration

final class QuantityEntryTests: XCTestCase {
    func testStepFollowsUnit() {
        XCTAssertEqual(QuantityEntry.step(for: "g"), 10)
        XCTAssertEqual(QuantityEntry.step(for: "ml"), 10)
        XCTAssertEqual(QuantityEntry.step(for: "kg"), 0.1)
        XCTAssertEqual(QuantityEntry.step(for: "unit"), 1)
        XCTAssertEqual(QuantityEntry.step(for: "cup"), 0.25)
    }

    func testParseClampsIntoRange() {
        XCTAssertEqual(QuantityEntry.parse("150", range: 0.01...1_000), 150)
        XCTAssertEqual(QuantityEntry.parse("0.5", range: 0.01...1_000), 0.5)
        XCTAssertNil(QuantityEntry.parse("nope", range: 0...10))
        XCTAssertEqual(QuantityEntry.parse("50", range: 1...10), 10)
    }

    func testFormatDropsNeedlessDecimals() {
        XCTAssertEqual(QuantityEntry.format(2), "2")
        let formatter = NumberFormatter()
        formatter.locale = .current
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = false
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        XCTAssertEqual(QuantityEntry.format(1.5), formatter.string(from: NSNumber(value: 1.5)))
    }
}
