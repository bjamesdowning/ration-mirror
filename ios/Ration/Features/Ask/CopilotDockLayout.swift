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
    /// Fallback until the live tab bar is measured. On the iPhone 16e / iOS 26.3
    /// simulator the bar is 83pt and the home-indicator inset is 34pt, so an overlay
    /// aligned to the safe area needs the remaining 49pt to sit on top of the bar.
    static let tabBarOverlapFallback: CGFloat = 49

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

    /// Extra space at the end of scroll content so the last row can clear the dock.
    /// This is a content margin, not frame padding, so the scroll view stays full-bleed.
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

    /// Overlay padding while the dock is bottom-aligned in the safe area.
    /// SwiftUI already includes the keyboard in that safe area, so a second
    /// `keyboardInset` throws the field to the top of the screen. With the keyboard
    /// up, add nothing. With it down, add only the tab-bar overlap.
    static func dockOverlayPadding(tabBarOverlap: CGFloat, keyboardInset: CGFloat) -> CGFloat {
        keyboardInset > 0 ? 0 : max(0, tabBarOverlap)
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
