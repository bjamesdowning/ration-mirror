import XCTest
@testable import Ration

final class CopilotScrollCollapsePolicyTests: XCTestCase {
    func testNormalizedOffsetAccountsForInsetGroupedTopInset() {
        let normalized = CopilotScrollCollapsePolicy.normalizedOffset(
            contentOffsetY: -20,
            adjustedTopInset: 20
        )
        XCTAssertEqual(normalized, 0)
    }

    func testCollapseRequiresThresholdDirectionAndExpandedState() {
        XCTAssertTrue(
            CopilotScrollCollapsePolicy.shouldCollapse(
                normalizedOffset: 30,
                direction: .down,
                isExpanded: true,
                isComposerFocused: false
            )
        )
        XCTAssertFalse(
            CopilotScrollCollapsePolicy.shouldCollapse(
                normalizedOffset: 10,
                direction: .down,
                isExpanded: true,
                isComposerFocused: false
            )
        )
        XCTAssertFalse(
            CopilotScrollCollapsePolicy.shouldCollapse(
                normalizedOffset: 30,
                direction: .down,
                isExpanded: true,
                isComposerFocused: true
            )
        )
    }

    func testExpandRequiresUpwardDirectionWhileCollapsed() {
        XCTAssertTrue(
            CopilotScrollCollapsePolicy.shouldExpand(
                normalizedOffset: 0,
                direction: .up,
                isExpanded: false,
                canAutoExpand: true,
                isComposerFocused: false
            )
        )
        XCTAssertFalse(
            CopilotScrollCollapsePolicy.shouldExpand(
                normalizedOffset: 40,
                direction: .up,
                isExpanded: false,
                canAutoExpand: true,
                isComposerFocused: false
            )
        )
        XCTAssertFalse(
            CopilotScrollCollapsePolicy.shouldExpand(
                normalizedOffset: 0,
                direction: .up,
                isExpanded: true,
                canAutoExpand: true,
                isComposerFocused: false
            )
        )
    }
}

final class CopilotScrollContextActiveTabTests: XCTestCase {
    @MainActor
    func testOnlyActiveTabAcceptsScrollReports() {
        let context = CopilotScrollContext()
        context.setActiveTab(.galley)

        XCTAssertTrue(context.shouldAcceptScrollReports(from: .galley, isTabActive: true))
        XCTAssertFalse(context.shouldAcceptScrollReports(from: .cargo, isTabActive: true))
        XCTAssertFalse(context.shouldAcceptScrollReports(from: .galley, isTabActive: false))
    }

    @MainActor
    func testPreloadedInactiveTabAcceptsReportsAfterActivation() {
        let context = CopilotScrollContext()
        context.setActiveTab(.galley)

        XCTAssertFalse(context.shouldAcceptScrollReports(from: .galley, isTabActive: false))
        XCTAssertTrue(context.shouldAcceptScrollReports(from: .galley, isTabActive: true))
    }

    @MainActor
    func testComposerFocusBlocksAutoCollapse() {
        let context = CopilotScrollContext()
        context.setComposerFocused(true)

        context.reportScroll(offset: 0)
        context.reportScroll(offset: 40)

        XCTAssertTrue(context.isExpanded)
    }
}
