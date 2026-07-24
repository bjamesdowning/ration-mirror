import XCTest
@testable import Ration

final class AppDeepLinkTests: XCTestCase {
    func testParsesAllowlistedDestinations() {
        XCTAssertEqual(AppDeepLink.parse("ration://ask"), .ask)
        XCTAssertEqual(AppDeepLink.parse("ration://scan"), .scan)
        XCTAssertEqual(AppDeepLink.parse("ration://cargo"), .cargo)
        XCTAssertEqual(AppDeepLink.parse("ration://galley/generate"), .galleyGenerate)
        XCTAssertEqual(AppDeepLink.parse("ration://galley/import"), .galleyImport)
        XCTAssertEqual(AppDeepLink.parse("ration://manifest/plan-week"), .manifestPlanWeek)
        XCTAssertEqual(AppDeepLink.parse("RATION://Ask"), .ask)
        XCTAssertEqual(AppDeepLink.parse("ration://Galley/Generate"), .galleyGenerate)
        XCTAssertEqual(AppDeepLink.parse("ration://MANIFEST/Plan-Week"), .manifestPlanWeek)
    }

    func testRejectsForeignSchemesAndUnknownPaths() {
        XCTAssertNil(AppDeepLink.parse("https://evil.example/scan"))
        XCTAssertNil(AppDeepLink.parse("javascript:alert(1)"))
        XCTAssertNil(AppDeepLink.parse("ration://auth/callback?code=abc"))
        XCTAssertNil(AppDeepLink.parse("ration://units"))
        XCTAssertNil(AppDeepLink.parse("ration://galley/other"))
        XCTAssertNil(AppDeepLink.parse("ration://manifest"))
        XCTAssertNil(AppDeepLink.parse(""))
        XCTAssertNil(AppDeepLink.parse("not a url"))
    }
}
