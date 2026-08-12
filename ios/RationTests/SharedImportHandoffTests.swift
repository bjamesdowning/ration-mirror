import XCTest
@testable import Ration

final class SharedImportHandoffTests: XCTestCase {
    override func setUp() {
        super.setUp()
        SharedImportHandoff.clearForTesting()
    }

    override func tearDown() {
        SharedImportHandoff.clearForTesting()
        super.tearDown()
    }

    func testConsumeReturnsURLAndAutoStartThenClears() {
        SharedImportHandoff.writePendingForTesting(
            url: "https://tiktok.com/@x/video/1",
            autoStart: true
        )
        let pending = SharedImportHandoff.consumePending()
        XCTAssertEqual(pending?.url, "https://tiktok.com/@x/video/1")
        XCTAssertEqual(pending?.autoStart, true)
        XCTAssertNil(SharedImportHandoff.consumePending())
    }

    func testConsumeDefaultsAutoStartFalseWhenUnset() {
        SharedImportHandoff.writePendingForTesting(
            url: "https://example.com/recipe",
            autoStart: false
        )
        let pending = SharedImportHandoff.consumePending()
        XCTAssertEqual(pending?.autoStart, false)
    }

    func testConsumeIgnoresStalePayload() {
        SharedImportHandoff.writePendingForTesting(
            url: "https://example.com/old",
            autoStart: true,
            at: Date().timeIntervalSince1970 - 700
        )
        XCTAssertNil(SharedImportHandoff.consumePending())
    }

    func testClearRemovesPendingWithoutConsume() {
        SharedImportHandoff.writePendingForTesting(
            url: "https://example.com/pending",
            autoStart: true
        )
        SharedImportHandoff.clear()
        XCTAssertNil(SharedImportHandoff.consumePending())
    }
}
