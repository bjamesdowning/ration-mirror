import XCTest
@testable import Ration

final class SupplyScanCompletePairEncodingTests: XCTestCase {
    func testEncodesNilSupplyItemIdAsJSONNull() throws {
        let pair = SupplyScanCompletePair(
            scanItemId: "11111111-1111-4111-8111-111111111111",
            supplyItemId: nil,
            matchType: "manual",
            dock: SupplyScanCompleteDock(
                name: "milk",
                quantity: 1,
                unit: "unit",
                domain: "food",
                tags: [],
                expiresAt: nil
            ),
            updateSupply: nil
        )

        let data = try JSONEncoder().encode(pair)
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertTrue(json.contains("\"supplyItemId\":null"))
        XCTAssertFalse(json.contains("\"expiresAt\""))
    }

    func testEncodesPresentSupplyItemId() throws {
        let id = "22222222-2222-4222-8222-222222222222"
        let pair = SupplyScanCompletePair(
            scanItemId: "11111111-1111-4111-8111-111111111111",
            supplyItemId: id,
            matchType: "exact",
            dock: SupplyScanCompleteDock(
                name: "eggs",
                quantity: 12,
                unit: "unit",
                domain: "food"
            )
        )

        let data = try JSONEncoder().encode(pair)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(object?["supplyItemId"] as? String, id)
    }
}
