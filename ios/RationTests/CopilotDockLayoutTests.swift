import XCTest
@testable import Ration

final class CopilotDockLayoutTests: XCTestCase {
    func testExpandedInputBarHeightMatchesSingleRowLayout() {
        XCTAssertEqual(CopilotDockLayout.expandedInputBarHeight, 64)
    }

    func testScrollContentMarginAddsKeyboardInset() {
        let base = CopilotDockLayout.scrollContentMarginForInsetDock(isExpanded: true, hasTabAction: true)
        let withKeyboard = CopilotDockLayout.scrollContentMarginForInsetDock(
            isExpanded: true,
            hasTabAction: true,
            keyboardInset: 336
        )

        XCTAssertGreaterThan(withKeyboard, base)
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

    func testInsetDockMarginUsesDockHeightOnly() {
        let margin = CopilotDockLayout.scrollContentMarginForInsetDock(isExpanded: true, hasTabAction: true)

        XCTAssertEqual(
            margin,
            CopilotDockLayout.dockHeight(isExpanded: true, hasTabAction: true)
        )
    }

    func testFixedScrollMarginMatchesExpandedDock() {
        let fixed = CopilotDockLayout.fixedScrollContentMargin(hasTabAction: true)
        let expanded = CopilotDockLayout.scrollContentMarginForInsetDock(isExpanded: true, hasTabAction: true)

        XCTAssertEqual(fixed, expanded)
    }

    func testToastOffsetSitsAboveScrollMargin() {
        let margin = CopilotDockLayout.scrollContentMarginForInsetDock(isExpanded: false, hasTabAction: true)
        let toast = CopilotDockLayout.toastBottomOffset(isExpanded: false, hasTabAction: true)

        XCTAssertGreaterThan(toast, margin)
    }
}
