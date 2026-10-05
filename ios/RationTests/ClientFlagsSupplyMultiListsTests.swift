import XCTest
@testable import Ration

final class ClientFlagsSupplyMultiListsTests: XCTestCase {
    func testMissingSupplyMultiListsIsFailClosed() throws {
        let json = #"{"nutritionEngine":true}"#.data(using: .utf8)!
        let flags = try JSONDecoder().decode(ClientFlags.self, from: json)
        XCTAssertFalse(flags.isSupplyMultiListsEnabled)
        XCTAssertTrue(flags.isNutritionEngineEnabled)
    }

    func testSupplyMultiListsTrue() throws {
        let json = #"{"supplyMultiLists":true}"#.data(using: .utf8)!
        let flags = try JSONDecoder().decode(ClientFlags.self, from: json)
        XCTAssertTrue(flags.isSupplyMultiListsEnabled)
    }
}
