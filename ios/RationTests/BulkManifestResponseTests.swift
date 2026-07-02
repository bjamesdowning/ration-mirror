import XCTest
@testable import Ration

final class BulkManifestResponseTests: XCTestCase {
    func testDecodesInsertedKey() throws {
        let data = Data(#"{"inserted": 5}"#.utf8)
        let response = try JSONDecoder().decode(BulkManifestResponse.self, from: data)
        XCTAssertEqual(response.inserted, 5)
    }

    func testDecodesLegacyAddedKey() throws {
        let data = Data(#"{"added": 3}"#.utf8)
        let response = try JSONDecoder().decode(BulkManifestResponse.self, from: data)
        XCTAssertEqual(response.inserted, 3)
    }

    func testEncodesInsertedKey() throws {
        let response = BulkManifestResponse(inserted: 7)
        let data = try JSONEncoder().encode(response)
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertTrue(json.contains("\"inserted\":7"))
    }
}
