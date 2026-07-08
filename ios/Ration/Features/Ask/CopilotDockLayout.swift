import CoreGraphics

/// Shared layout constants for the stacked Copilot dock + tab FAB pattern.
enum CopilotDockLayout {
    static let fabSize: CGFloat = 56
    static let fabTrailingPadding: CGFloat = 16
    static let dockHorizontalPadding: CGFloat = 16
    static let dockBottomPadding: CGFloat = 8
    static let dockRowSpacing: CGFloat = 8
    static let expandedInputBarHeight: CGFloat = 52
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

    /// Scroll content margin so the last row can scroll into view under the glass dock.
    static func scrollContentMargin(isExpanded: Bool, hasTabAction: Bool = true) -> CGFloat {
        dockHeight(isExpanded: isExpanded, hasTabAction: hasTabAction) + tabBarClearance
    }

    /// Toast / undo banner offset above the tab bar and dock.
    static func toastBottomOffset(isExpanded: Bool, hasTabAction: Bool = true) -> CGFloat {
        scrollContentMargin(isExpanded: isExpanded, hasTabAction: hasTabAction) + 12
    }
}
