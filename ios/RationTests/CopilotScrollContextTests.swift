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
        context.markScrollEnded()

        XCTAssertFalse(context.isExpanded)
        XCTAssertEqual(context.scrollDirection, .down)
    }

    func testInitialScrollReportSeedsOffsetWithoutCollapsingBar() {
        let context = CopilotScrollContext()

        context.reportScroll(offset: 240, isInitial: true)

        XCTAssertTrue(context.isExpanded)
        XCTAssertEqual(context.scrollDirection, .idle)
    }

    func testScrollUpReExpandsWhenAutoExpandAllowed() {
        let context = CopilotScrollContext()
        context.reportScroll(offset: 40)
        context.markScrollEnded()
        XCTAssertFalse(context.isExpanded)

        context.reportScroll(offset: 0)
        context.markScrollEnded()

        XCTAssertTrue(context.isExpanded)
        XCTAssertEqual(context.scrollDirection, .up)
    }

    func testScrollUpDoesNotReExpandWhenAutoExpandDisabled() {
        let context = CopilotScrollContext()
        context.setCanAutoExpand(false)
        context.reportScroll(offset: 0)
        context.reportScroll(offset: 40)
        context.markScrollEnded()
        XCTAssertFalse(context.isExpanded)

        context.reportScroll(offset: 20)
        context.markScrollEnded()

        XCTAssertFalse(context.isExpanded)
    }

    func testKeyboardInsetUpdates() {
        let context = CopilotScrollContext()

        context.setKeyboardInset(320)

        XCTAssertEqual(context.keyboardInset, 320)

        context.setKeyboardInset(0)

        XCTAssertEqual(context.keyboardInset, 0)
    }

    func testComposerHeightTracksMultilineGrowthWithoutShrinkingBelowSingleLine() {
        let context = CopilotScrollContext()

        context.setComposerHeight(112)
        XCTAssertEqual(context.composerHeight, 112)

        context.setComposerHeight(20)
        XCTAssertEqual(context.composerHeight, CopilotDockLayout.expandedInputBarHeight)
    }

    func testKeyboardGeometryUsesBottomAttachedIntersection() {
        let inset = CopilotKeyboardGeometry.bottomInset(
            keyboardFrame: CGRect(x: 0, y: 500, width: 390, height: 344),
            windowBounds: CGRect(x: 0, y: 0, width: 390, height: 844)
        )

        XCTAssertEqual(inset, 344)
    }

    func testKeyboardGeometryIgnoresFloatingKeyboard() {
        let inset = CopilotKeyboardGeometry.bottomInset(
            keyboardFrame: CGRect(x: 80, y: 300, width: 300, height: 220),
            windowBounds: CGRect(x: 0, y: 0, width: 1024, height: 768)
        )

        XCTAssertEqual(inset, 0)
    }

    func testKeyboardGeometryCapsExcessiveInset() {
        let inset = CopilotKeyboardGeometry.bottomInset(
            keyboardFrame: CGRect(x: 0, y: 100, width: 390, height: 744),
            windowBounds: CGRect(x: 0, y: 0, width: 390, height: 844)
        )

        XCTAssertEqual(inset, 844 * CopilotKeyboardGeometry.maximumInsetFraction, accuracy: 0.001)
    }

    func testTabResetDismissesKeyboardAndClearsInset() {
        let context = CopilotScrollContext()
        var dismissed = false
        context.registerDismissKeyboardHandler { dismissed = true }
        context.setKeyboardInset(320)

        context.resetForTabChange()

        XCTAssertTrue(dismissed)
        XCTAssertEqual(context.keyboardInset, 0)
    }

    func testDismissKeyboardClearsKeyboardInset() {
        let context = CopilotScrollContext()
        context.setKeyboardInset(320)

        context.dismissKeyboard()

        XCTAssertEqual(context.keyboardInset, 0)
    }

    func testDeferredCollapseAppliesAfterScrollEnds() {
        let context = CopilotScrollContext()

        context.markScrollActive()
        context.reportScroll(offset: 0)
        context.reportScroll(offset: 40)

        XCTAssertTrue(context.isExpanded)

        context.markScrollEnded()

        XCTAssertFalse(context.isExpanded)
    }
}
