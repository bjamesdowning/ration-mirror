import XCTest
@testable import Ration

final class ScanUserFacingErrorTests: XCTestCase {
    func testMapsJSONSyntaxErrorToCustomerCopy() {
        let raw =
            "Expected ':' after property name in JSON at position 3390 (line 1 column 3391)"
        XCTAssertEqual(
            ScanUserFacingError.message(from: raw),
            ScanUserFacingError.parse
        )
    }

    func testPassesThroughCustomerCopy() {
        let msg = "We couldn't find your upload. Please try scanning again."
        XCTAssertEqual(ScanUserFacingError.message(from: msg), msg)
    }

    func testNilAndEmptyUseGeneric() {
        XCTAssertEqual(ScanUserFacingError.message(from: nil), ScanUserFacingError.generic)
        XCTAssertEqual(ScanUserFacingError.message(from: "  "), ScanUserFacingError.generic)
    }
}
