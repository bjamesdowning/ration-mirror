import Foundation

/// Primary action shown on a Manifest entry row.
///
/// Fail-closed: without `nutrition-cook-log-split`, every entry uses the
/// legacy single-tap Consume flow. Eat (private serving log) is only ever
/// reachable after Cook — never offered on an uncooked entry.
enum ManifestEntryAction: Equatable {
    /// Pre-split (or split flag off): one tap deducts Cargo and marks done.
    case legacyConsume
    /// Split: entry not yet prepared — deduct Cargo / mark cooked.
    case cook
    /// Split + nutrition-manifest on, cooked, no active personal log yet.
    case logServing
    /// Split + nutrition-manifest on, cooked, caller already logged a serving.
    case editServing
    /// Cooked, but nutrition-manifest is off — nothing left to do here.
    case none
}

/// Pure flag/state → UI-action mapping for `ManifestEntryRow`. No I/O, no environment reads.
enum ManifestEntryActionPolicy {
    struct Flags: Equatable {
        var isCookLogSplitEnabled: Bool
        var isNutritionManifestEnabled: Bool

        static let disabled = Flags(isCookLogSplitEnabled: false, isNutritionManifestEnabled: false)
    }

    /// - Parameters:
    ///   - flags: Client feature flags from the active session (fail-closed when missing).
    ///   - isCooked: Effective prepared state (`entry.cookedAt != nil`, which already
    ///     folds in the legacy `consumedAt` fallback server-side).
    ///   - hasPersonalIntake: Whether the caller has an active personal intake row for this entry.
    static func primaryAction(
        flags: Flags,
        isCooked: Bool,
        hasPersonalIntake: Bool
    ) -> ManifestEntryAction {
        guard flags.isCookLogSplitEnabled else {
            return isCooked ? .none : .legacyConsume
        }
        guard isCooked else {
            return .cook
        }
        guard flags.isNutritionManifestEnabled else {
            return .none
        }
        return hasPersonalIntake ? .editServing : .logServing
    }

    /// Whether the "Eat" (log serving) affordance may ever appear for this entry —
    /// used to decide whether to render a secondary action alongside Cook.
    static func canEverLogServing(flags: Flags) -> Bool {
        flags.isCookLogSplitEnabled && flags.isNutritionManifestEnabled
    }

    static func systemImage(for action: ManifestEntryAction) -> String {
        switch action {
        case .legacyConsume, .cook:
            return "fork.knife.circle.fill"
        case .logServing:
            return "plus.circle.fill"
        case .editServing:
            return "checkmark.circle.fill"
        case .none:
            return "checkmark.seal.fill"
        }
    }

    static func accessibilityLabel(for action: ManifestEntryAction) -> String {
        switch action {
        case .legacyConsume:
            return "Consume meal and deduct from Cargo"
        case .cook:
            return "Cook meal and deduct from Cargo"
        case .logServing:
            return "Log my serving"
        case .editServing:
            return "Edit my logged serving"
        case .none:
            return "Cooked"
        }
    }
}
