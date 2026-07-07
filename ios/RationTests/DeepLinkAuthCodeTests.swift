import Foundation
import XCTest
@testable import Ration

/// Exercises `RationApp.authCode(from:)` deep-link parsing for both the
/// Universal Link and custom-scheme callback shapes, plus rejection cases.
final class DeepLinkAuthCodeTests: XCTestCase {
    func testParsesUniversalLinkCode() {
        let url = URL(string: "https://ration.mayutic.com/auth/mobile-callback/open?code=code-123")!
        XCTAssertEqual(RationApp.authCode(from: url), "code-123")
    }

    func testParsesCustomSchemeCode() {
        let url = URL(string: "ration://auth/callback?code=code-456")!
        XCTAssertEqual(RationApp.authCode(from: url), "code-456")
    }

    func testExtractsCodeAmongMultipleQueryItems() {
        let url = URL(string: "ration://auth/callback?state=xyz&code=code-789&foo=bar")!
        XCTAssertEqual(RationApp.authCode(from: url), "code-789")
    }

    func testReturnsNilWhenCodeQueryItemMissing() {
        let url = URL(string: "ration://auth/callback?state=xyz")!
        XCTAssertNil(RationApp.authCode(from: url))
    }

    func testRejectsUniversalLinkOnWrongHost() {
        let url = URL(string: "https://evil.example/auth/mobile-callback/open?code=nope")!
        XCTAssertNil(RationApp.authCode(from: url))
    }

    func testRejectsUniversalLinkOnWrongPath() {
        let url = URL(string: "https://ration.mayutic.com/hub?code=nope")!
        XCTAssertNil(RationApp.authCode(from: url))
    }

    func testRejectsCustomSchemeOnWrongHost() {
        let url = URL(string: "ration://elsewhere?code=nope")!
        XCTAssertNil(RationApp.authCode(from: url))
    }

    func testRejectsUnknownScheme() {
        let url = URL(string: "evil://auth/callback?code=nope")!
        XCTAssertNil(RationApp.authCode(from: url))
    }
}
