import XCTest
@testable import Ration

final class SupplyModelsDecodingTests: XCTestCase {
    func testOldSupplyItemPayloadStillDecodes() throws {
        let json = """
        {"id":"1","name":"Milk","quantity":2,"unit":"L","domain":"food","isPurchased":false}
        """.data(using: .utf8)!
        let item = try JSONDecoder().decode(SupplyItem.self, from: json)
        XCTAssertEqual(item.name, "Milk")
        XCTAssertNil(item.live)
        XCTAssertNil(item.inCargo)
        XCTAssertNil(item.lastDockedAt)
    }

    func testSavedStatusDecodesAndUnknownKeysAreIgnored() throws {
        let json = """
        {"id":"1","name":"Milk","quantity":1,"unit":"L","domain":"food","isPurchased":false,"live":{"state":"on_live","quantity":2,"unit":"L","manualOnly":true,"liveItemId":"live-1"},"inCargo":1,"lastDockedAt":"2026-10-01T00:00:00.000Z","futureField":true}
        """.data(using: .utf8)!
        let item = try JSONDecoder().decode(SupplyItem.self, from: json)
        XCTAssertEqual(item.live?.state, "on_live")
        XCTAssertEqual(item.live?.manualOnly, true)
        XCTAssertEqual(item.inCargo, 1)
        XCTAssertEqual(item.lastDockedAt, "2026-10-01T00:00:00.000Z")
    }

    func testCatalogSummaryDecodesCreatedFrom() throws {
        let json = """
        {"id":"list-1","name":"Staples","kind":"saved","state":"saved","createdFrom":"manual","itemCount":4,"purchasedCount":0,"capabilities":{"canAddToLive":true,"canDock":false}}
        """.data(using: .utf8)!
        let summary = try JSONDecoder().decode(SupplyCatalogSummary.self, from: json)
        XCTAssertEqual(summary.createdFrom, "manual")
        XCTAssertEqual(summary.capabilities?.canAddToLive, true)
        XCTAssertEqual(summary.capabilities?.canDock, false)
    }
}
