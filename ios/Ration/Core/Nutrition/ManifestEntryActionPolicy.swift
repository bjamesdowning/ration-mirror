import Foundation

/// Primary action shown on a Manifest entry row.
///
/// Eat (private serving log) is only ever reachable after Cook — never offered
/// on an uncooked entry.
enum ManifestEntryAction: Equatable {
    /// Entry not yet prepared — deduct Cargo / mark cooked.
    case cook
    /// Cooked, no active personal log yet.
    case logServing
    /// Cooked, caller already logged a serving.
    case editServing
}

/// Pure state → UI-action mapping for `ManifestEntryRow`. No I/O, no environment reads.
enum ManifestEntryActionPolicy {
    /// - Parameters:
    ///   - isCooked: Effective prepared state (`entry.cookedAt != nil`, which already
    ///     folds in the legacy `consumedAt` fallback server-side).
    ///   - hasPersonalIntake: Whether the caller has an active personal intake row for this entry.
    static func primaryAction(isCooked: Bool, hasPersonalIntake: Bool) -> ManifestEntryAction {
        guard isCooked else { return .cook }
        return hasPersonalIntake ? .editServing : .logServing
    }

    static func accessibilityLabel(for action: ManifestEntryAction) -> String {
        switch action {
        case .cook:
            return "Cook meal and deduct from Cargo"
        case .logServing:
            return "Log my serving"
        case .editServing:
            return "Edit my logged serving"
        }
    }
}
