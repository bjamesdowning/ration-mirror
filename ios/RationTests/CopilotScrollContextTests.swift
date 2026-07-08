import XCTest
@testable import Ration

@MainActor
final class CopilotScrollContextTests: XCTestCase {
    func testResetForTabChangeIncrementsTrackingGeneration() {
        let context = CopilotScrollContext()
        let initial = context.trackingGeneration

        context.resetForTabChange()

        XCTAssertEqual(context.trackingGeneration, initial + 1)
    }

    func testCollapseSetsExpandedFalse() {
        let context = CopilotScrollContext()
        context.expandManually()
        XCTAssertTrue(context.isExpanded)

        context.collapse()

        XCTAssertFalse(context.isExpanded)
    }
}
