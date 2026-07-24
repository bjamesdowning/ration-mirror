import XCTest
@testable import Ration

final class KeychainStatusTests: XCTestCase {
    func testMapSuccess() {
        XCTAssertEqual(Keychain.Status.map(errSecSuccess), .success)
    }

    func testMapFailure() {
        XCTAssertEqual(Keychain.Status.map(errSecDuplicateItem), .failure(errSecDuplicateItem))
        XCTAssertEqual(Keychain.Status.map(errSecItemNotFound), .failure(errSecItemNotFound))
    }
}
