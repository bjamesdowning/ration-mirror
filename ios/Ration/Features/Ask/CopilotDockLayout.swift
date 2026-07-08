import CoreGraphics

/// Shared layout constants for the dual-dock Copilot bar + tab FAB pattern.
enum CopilotDockLayout {
    static let fabSize: CGFloat = 56
    static let fabTrailingPadding: CGFloat = 16
    /// Reserved trailing space so the Copilot bar never covers tab action FABs.
    static let fabGutter: CGFloat = fabSize + fabTrailingPadding

    static func bottomContentPadding(isExpanded: Bool) -> CGFloat {
        isExpanded ? 120 : 104
    }
}
