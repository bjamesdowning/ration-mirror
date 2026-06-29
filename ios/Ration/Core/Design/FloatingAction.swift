import SwiftUI

/// Single action in the floating action bar — mirrors web `FloatingAction`.
struct FloatingAction: Identifiable {
    let id: String
    let systemImage: String
    let label: String
    var action: () -> Void = {}
    /// AI-powered actions use Hyper-Green; manual actions use platinum.
    var isAI = false
    /// Deprecated — use `isAI` instead. Kept for backward compatibility.
    var primary = false
    var variant: Variant = .default
    var disabled = false

    enum Variant {
        case `default`, primary, danger
    }

    var usesAccentStyle: Bool {
        isAI || primary || variant == .primary
    }
}
