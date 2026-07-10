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

    func testKeyboardInsetUpdates() {
        let context = CopilotScrollContext()

        context.setKeyboardInset(320)

        XCTAssertEqual(context.keyboardInset, 320)

        context.setKeyboardInset(0)

        XCTAssertEqual(context.keyboardInset, 0)
    }

    func testCollapseDismissesKeyboardViaHandler() {
        let context = CopilotScrollContext()
        var dismissed = false
        context.registerDismissKeyboardHandler { dismissed = true }
        context.expandManually()

        context.collapse()

        XCTAssertTrue(dismissed)
    }
}
