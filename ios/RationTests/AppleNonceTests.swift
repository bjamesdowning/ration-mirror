import XCTest
@testable import Ration

final class AppleNonceTests: XCTestCase {
    func testSha256ProducesLowercaseHex() {
        let digest = AppleSignInNonce.sha256("test-nonce")
        XCTAssertEqual(digest.count, 64)
        XCTAssertEqual(digest, digest.lowercased())
        XCTAssertTrue(digest.allSatisfy { $0.isHexDigit })
    }

    func testRandomNonceStringLength() {
        let nonce = AppleSignInNonce.randomNonceString(length: 43)
        XCTAssertEqual(nonce.count, 43)
    }

    func testRandomNonceStringsAreUnique() {
        let a = AppleSignInNonce.randomNonceString()
        let b = AppleSignInNonce.randomNonceString()
        XCTAssertNotEqual(a, b)
    }
}
