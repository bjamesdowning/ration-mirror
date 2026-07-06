import Foundation
import Observation

/// Shared "proceed" gate for AI entry points (`ScanView`, `GenerateMealSheet`,
/// `ImportRecipeSheet`, `PlanWeekSheet`, `SupplyView` replenish scan) — see H-8.
///
/// Each entry point owns one `@State private var consent = AIConsentCoordinator()`
/// and calls `presentIfNeeded(session:then:)` in place of its "proceed" action,
/// instead of duplicating a local `showingConsentGate`/`hasAIConsent` state
/// machine. Consent state itself lives on `SessionStore.hasAIConsent`
/// (loaded once at app start in `RootView`), so accepting from any one entry
/// point is immediately reflected in the other three without a second
/// prompt or network fetch.
@MainActor
@Observable
final class AIConsentCoordinator {
    var isPresenting = false
    private var pendingAction: (() -> Void)?

    /// Runs `action` immediately when consent is already recorded;
    /// otherwise defers it and shows the shared `AIConsentGateView`.
    func presentIfNeeded(session: SessionStore, then action: @escaping () -> Void) {
        if session.hasAIConsent {
            action()
        } else {
            pendingAction = action
            isPresenting = true
        }
    }

    /// Records consent server-side, updates the shared session flag, and
    /// runs the action that was deferred by `presentIfNeeded`.
    func accept(api: RationAPI, session: SessionStore) async {
        _ = try? await api.patchSettings(
            SettingsPatch(aiConsentAt: ISO8601DateFormatter().string(from: Date()))
        )
        session.markAIConsentGranted()
        isPresenting = false
        runPendingAction()
    }

    /// Dismisses the gate without recording consent or running the deferred action.
    func decline() {
        isPresenting = false
        pendingAction = nil
    }

    private func runPendingAction() {
        let action = pendingAction
        pendingAction = nil
        action?()
    }
}
