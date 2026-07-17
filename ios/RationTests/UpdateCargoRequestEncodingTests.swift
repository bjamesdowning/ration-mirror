import XCTest
@testable import Ration

final class UpdateCargoRequestEncodingTests: XCTestCase {
    func testClearEncodesExpiresAtAsJSONNull() throws {
        let body = UpdateCargoRequest(
            name: "milk",
            quantity: 1,
            unit: "unit",
            domain: "food",
            tags: [],
            expiresAt: .clear
        )

        let data = try JSON.encoder.encode(body)
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertTrue(json.contains("\"expiresAt\":null"))
    }

    func testOmitExcludesExpiresAtKey() throws {
        let body = UpdateCargoRequest(quantity: 0)

        let data = try JSON.encoder.encode(body)
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertFalse(json.contains("expiresAt"))
        XCTAssertTrue(json.contains("\"quantity\":0"))
    }

    func testSetEncodesISO8601Date() throws {
        let date = Date(timeIntervalSince1970: 1_767_225_600) // 2025-12-31T00:00:00Z
        let body = UpdateCargoRequest(expiresAt: .set(date))

        let data = try JSON.encoder.encode(body)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
        let encoded = try XCTUnwrap(object["expiresAt"] as? String)
        let decoded = try XCTUnwrap(ISO8601DateFormatter().date(from: encoded))
        XCTAssertEqual(decoded.timeIntervalSince1970, date.timeIntervalSince1970, accuracy: 0.001)
    }
}
