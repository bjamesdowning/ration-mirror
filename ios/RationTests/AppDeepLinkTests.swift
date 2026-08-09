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

    func testParsesManifestAddWithValidParams() {
        let mealId = "550e8400-e29b-41d4-a716-446655440000"
        let url = "ration://manifest/add?mealId=\(mealId)&date=2026-08-09"
        XCTAssertEqual(
            AppDeepLink.parse(url),
            .manifestAddEntry(mealId: mealId, date: "2026-08-09")
        )
        XCTAssertEqual(
            AppDeepLink.parse("RATION://Manifest/Add?mealId=\(mealId)&date=2026-08-09"),
            .manifestAddEntry(mealId: mealId, date: "2026-08-09")
        )
    }

    func testRejectsManifestAddWithBadParams() {
        let mealId = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertNil(AppDeepLink.parse("ration://manifest/add"))
        XCTAssertNil(AppDeepLink.parse("ration://manifest/add?mealId=\(mealId)"))
        XCTAssertNil(AppDeepLink.parse("ration://manifest/add?date=2026-08-09"))
        XCTAssertNil(AppDeepLink.parse("ration://manifest/add?mealId=not-a-uuid&date=2026-08-09"))
        XCTAssertNil(AppDeepLink.parse("ration://manifest/add?mealId=\(mealId)&date=08-09-2026"))
        XCTAssertNil(AppDeepLink.parse("ration://manifest/add?mealId=\(mealId)&date=2026-13-01"))
        XCTAssertNil(AppDeepLink.parse("ration://manifest/add?mealId=\(mealId)&date=2026-02-30"))
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
