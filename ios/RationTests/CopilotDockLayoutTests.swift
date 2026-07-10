import XCTest
@testable import Ration

final class CopilotDockLayoutTests: XCTestCase {
    func testExpandedInputBarHeightMatchesSingleRowLayout() {
        XCTAssertEqual(CopilotDockLayout.expandedInputBarHeight, 64)
    }

    func testExpandedDockHeightIncludesFabAndInput() {
        let height = CopilotDockLayout.dockHeight(isExpanded: true, hasTabAction: true)

        XCTAssertGreaterThan(height, CopilotDockLayout.expandedInputBarHeight)
        XCTAssertGreaterThanOrEqual(height, CopilotDockLayout.fabSize + CopilotDockLayout.expandedInputBarHeight)
    }

    func testCollapsedDockHeightUsesSingleRow() {
        let withAction = CopilotDockLayout.dockHeight(isExpanded: false, hasTabAction: true)
        let withoutAction = CopilotDockLayout.dockHeight(isExpanded: false, hasTabAction: false)

        XCTAssertGreaterThanOrEqual(withAction, CopilotDockLayout.fabSize)
        XCTAssertGreaterThan(withAction, withoutAction)
        XCTAssertGreaterThanOrEqual(withoutAction, CopilotDockLayout.collapsedChatChipSize)
    }

    func testScrollContentMarginAddsTabBarClearance() {
        let margin = CopilotDockLayout.scrollContentMargin(isExpanded: true, hasTabAction: true)

        XCTAssertEqual(
            margin,
            CopilotDockLayout.dockHeight(isExpanded: true, hasTabAction: true) + CopilotDockLayout.tabBarClearance
        )
    }

    func testExpandedMarginGreaterThanCollapsed() {
        let expanded = CopilotDockLayout.scrollContentMargin(isExpanded: true, hasTabAction: true)
        let collapsed = CopilotDockLayout.scrollContentMargin(isExpanded: false, hasTabAction: true)

        XCTAssertGreaterThan(expanded, collapsed)
    }

    func testToastOffsetSitsAboveScrollMargin() {
        let margin = CopilotDockLayout.scrollContentMargin(isExpanded: false, hasTabAction: true)
        let toast = CopilotDockLayout.toastBottomOffset(isExpanded: false, hasTabAction: true)

        XCTAssertGreaterThan(toast, margin)
    }
}
