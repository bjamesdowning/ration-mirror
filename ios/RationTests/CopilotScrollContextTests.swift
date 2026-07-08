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

    func testScrollDownPastThresholdCollapsesBar() {
        let context = CopilotScrollContext()

        context.reportScroll(offset: 0)
        context.reportScroll(offset: 30)

        XCTAssertFalse(context.isExpanded)
        XCTAssertEqual(context.scrollDirection, .down)
    }

    func testScrollUpReExpandsWhenAutoExpandAllowed() {
        let context = CopilotScrollContext()
        context.reportScroll(offset: 40)
        XCTAssertFalse(context.isExpanded)

        context.reportScroll(offset: 20)

        XCTAssertTrue(context.isExpanded)
        XCTAssertEqual(context.scrollDirection, .up)
    }

    func testScrollUpDoesNotReExpandWhenAutoExpandDisabled() {
        let context = CopilotScrollContext()
        context.setCanAutoExpand(false)
        context.reportScroll(offset: 0)
        context.reportScroll(offset: 40)
        XCTAssertFalse(context.isExpanded)

        context.reportScroll(offset: 20)

        XCTAssertFalse(context.isExpanded)
    }
}
