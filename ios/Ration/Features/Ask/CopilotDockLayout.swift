import CoreGraphics

/// Shared layout constants for the stacked Copilot dock + tab FAB pattern.
enum CopilotDockLayout {
    static let fabSize: CGFloat = 56
    static let fabTrailingPadding: CGFloat = 16
    static let dockHorizontalPadding: CGFloat = 16
    static let dockBottomPadding: CGFloat = 8
    static let dockRowSpacing: CGFloat = 8
    static let expandedInputBarHeight: CGFloat = 64
    static let collapsedChatChipSize: CGFloat = 48
    static let tabBarClearance: CGFloat = 56

    /// Copilot dock height above the tab bar (excludes tab bar clearance).
    static func dockHeight(isExpanded: Bool, hasTabAction: Bool) -> CGFloat {
        let actionRow = hasTabAction ? fabSize : 0
        if isExpanded {
            let stackSpacing = hasTabAction ? dockRowSpacing : 0
            return dockBottomPadding + actionRow + stackSpacing + expandedInputBarHeight
        }
        let rowHeight = max(collapsedChatChipSize, hasTabAction ? fabSize : 0)
        return dockBottomPadding + rowHeight
    }

    /// Scroll margin when dock lives in `TabView.safeAreaInset` (content area already excludes tab bar).
    static func scrollContentMarginForInsetDock(
        isExpanded: Bool,
        hasTabAction: Bool = true,
        keyboardInset: CGFloat = 0
    ) -> CGFloat {
        dockHeight(isExpanded: isExpanded, hasTabAction: hasTabAction)
            + max(0, keyboardInset)
    }

    /// Fixed scroll clearance — always reserve expanded dock space; collapse is visual-only.
    static func fixedScrollContentMargin(hasTabAction: Bool = true) -> CGFloat {
        scrollContentMarginForInsetDock(isExpanded: true, hasTabAction: hasTabAction)
    }

    /// Legacy overlay-dock margin (dock + tab bar clearance).
    static func scrollContentMargin(
        isExpanded: Bool,
        hasTabAction: Bool = true,
        keyboardInset: CGFloat = 0
    ) -> CGFloat {
        scrollContentMarginForInsetDock(
            isExpanded: isExpanded,
            hasTabAction: hasTabAction,
            keyboardInset: keyboardInset
        )
    }

    /// Toast / undo banner offset above the dock inset region.
    static func toastBottomOffset(
        isExpanded: Bool,
        hasTabAction: Bool = true,
        keyboardInset: CGFloat = 0
    ) -> CGFloat {
        scrollContentMarginForInsetDock(
            isExpanded: isExpanded,
            hasTabAction: hasTabAction,
            keyboardInset: keyboardInset
        ) + 12
    }
}
