import XCTest
@testable import Ration

final class RecipePageNavigationPolicyTests: XCTestCase {
    func testAllowsHTTPS() {
        XCTAssertTrue(RecipePageNavigationPolicy.shouldAllow(URL(string: "https://example.com/recipe")))
        XCTAssertTrue(RecipePageNavigationPolicy.shouldAllow(URL(string: "HTTPS://Example.COM/path")))
    }

    func testCancelsNonHTTPSAndMissing() {
        XCTAssertFalse(RecipePageNavigationPolicy.shouldAllow(URL(string: "http://example.com/recipe")))
        XCTAssertFalse(RecipePageNavigationPolicy.shouldAllow(URL(string: "ration://scan")))
        XCTAssertFalse(RecipePageNavigationPolicy.shouldAllow(URL(string: "javascript:alert(1)")))
        XCTAssertFalse(RecipePageNavigationPolicy.shouldAllow(URL(string: "blob:https://example.com/1")))
        XCTAssertFalse(RecipePageNavigationPolicy.shouldAllow(nil))
    }
}
