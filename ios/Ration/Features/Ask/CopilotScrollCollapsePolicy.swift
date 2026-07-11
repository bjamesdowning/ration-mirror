import CoreGraphics

enum CopilotScrollDirection: Equatable {
    case up
    case down
    case idle
}

enum CopilotScrollCollapsePolicy {
    static let collapseThreshold: CGFloat = 24
    static let directionEpsilon: CGFloat = 1

    static func normalizedOffset(contentOffsetY: CGFloat, adjustedTopInset: CGFloat) -> CGFloat {
        contentOffsetY + adjustedTopInset
    }

    static func direction(delta: CGFloat) -> CopilotScrollDirection? {
        if delta > directionEpsilon { return .down }
        if delta < -directionEpsilon { return .up }
        return nil
    }

    static func shouldCollapse(
        normalizedOffset: CGFloat,
        direction: CopilotScrollDirection,
        isExpanded: Bool,
        isComposerFocused: Bool
    ) -> Bool {
        guard isExpanded, !isComposerFocused, direction == .down else { return false }
        return normalizedOffset > collapseThreshold
    }

    static func shouldExpand(
        direction: CopilotScrollDirection,
        isExpanded: Bool,
        canAutoExpand: Bool,
        isComposerFocused: Bool
    ) -> Bool {
        guard !isExpanded, canAutoExpand, !isComposerFocused, direction == .up else { return false }
        return true
    }
}
