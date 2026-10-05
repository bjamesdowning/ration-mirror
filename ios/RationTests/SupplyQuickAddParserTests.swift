import XCTest
@testable import Ration

final class SupplyQuickAddParserTests: XCTestCase {
    func testCommaJotKeepsHouseholdSeparate() {
        let items = SupplyQuickAddParser.parse("butter, eggs, bread, milk, yogurt, shampoo")
        XCTAssertEqual(items.map(\.name), ["butter", "eggs", "bread", "milk", "yogurt", "shampoo"])
        XCTAssertEqual(items.first { $0.name == "shampoo" }?.domain, "household")
    }

    func testPreambleAndCompoundName() {
        let items = SupplyQuickAddParser.parse("okay I need bread and butter, eggs")
        XCTAssertEqual(items.map(\.name), ["bread and butter", "eggs"])
    }

    func testQuantityAndLines() {
        let items = SupplyQuickAddParser.parse("2 lb chicken\n2x milk")
        XCTAssertEqual(items.count, 2)
        XCTAssertEqual(items[0].name, "chicken")
        XCTAssertEqual(items[0].quantity, 2)
        XCTAssertEqual(items[0].unit, "lb")
        XCTAssertEqual(items[1].name, "milk")
        XCTAssertEqual(items[1].quantity, 2)
    }
}
