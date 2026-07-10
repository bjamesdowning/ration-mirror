import XCTest
@testable import Ration

final class DirectionsParserTests: XCTestCase {
    func testParseEmptyString() {
        XCTAssertTrue(DirectionsParser.parseDirections("").isEmpty)
        XCTAssertTrue(DirectionsParser.parseDirections(nil).isEmpty)
    }

    func testParseNewlineDelimitedString() {
        let raw = "Preheat oven to 200°C.\nMix flour and eggs.\nBake for 20 minutes."
        let steps = DirectionsParser.parseDirections(raw)
        XCTAssertEqual(steps.count, 3)
        XCTAssertEqual(steps[0].text, "Preheat oven to 200°C.")
        XCTAssertEqual(steps[1].position, 2)
    }

    func testStripsNumberedPrefixes() {
        let raw = "1. Preheat oven.\n2. Mix ingredients.\n3) Bake."
        let steps = DirectionsParser.parseDirections(raw)
        XCTAssertEqual(steps[0].text, "Preheat oven.")
        XCTAssertEqual(steps[2].text, "Bake.")
    }

    func testParseJSONString() {
        let json = """
        [{"position":1,"text":"Preheat oven."},{"position":2,"text":"Bake."}]
        """
        let steps = DirectionsParser.parseDirections(json)
        XCTAssertEqual(steps.count, 2)
        XCTAssertEqual(steps[0].text, "Preheat oven.")
    }

    func testPreservesSectionHeadings() {
        let json = """
        [{"position":1,"text":"Mix dry ingredients.","section":"Dry Mix"}]
        """
        let steps = DirectionsParser.parseDirections(json)
        XCTAssertEqual(steps[0].section, "Dry Mix")
    }

    func testSerializeRoundTrip() {
        let original = [
            RecipeStep(position: 1, text: "Preheat oven."),
            RecipeStep(position: 2, text: "Bake for 20 minutes."),
        ]
        let serialized = DirectionsParser.serializeDirections(original)
        let restored = DirectionsParser.parseDirections(serialized)
        XCTAssertEqual(restored.count, 2)
        XCTAssertEqual(restored[0].text, "Preheat oven.")
        XCTAssertEqual(restored[1].text, "Bake for 20 minutes.")
    }

    func testFiltersEmptyLines() {
        let raw = "Step one.\n\n\nStep two."
        let steps = DirectionsParser.parseDirections(raw)
        XCTAssertEqual(steps.count, 2)
    }
}

final class SnapshotStoreSyncStateTests: XCTestCase {
    @MainActor
    func testFreshWhenRecentlySynced() async {
        let store = SnapshotStore()
        let orgId = "test-org-sync-fresh-legacy"
        await store.save(["items": []] as [String: [String]], domain: "cargo", organizationId: orgId)
        let state = store.syncState(domain: "cargo", organizationId: orgId, online: true)
        XCTAssertEqual(state, .fresh)
        await store.clear(organizationId: orgId)
    }

    @MainActor
    func testOfflineWhenNotOnline() async {
        let store = SnapshotStore()
        let orgId = "test-org-sync-offline-legacy"
        await store.save(["items": []] as [String: [String]], domain: "cargo", organizationId: orgId)
        let state = store.syncState(domain: "cargo", organizationId: orgId, online: false)
        if case .offline = state {
            XCTAssertTrue(true)
        } else {
            XCTFail("Expected offline state")
        }
        await store.clear(organizationId: orgId)
    }
}
