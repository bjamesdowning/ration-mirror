import Foundation
import Observation

/// Shared "proceed" gate for AI entry points (Scan, Generate meal, Import recipe,
/// Plan week, Supply receipt scan, Ask Ration and the onboarding briefing).
///
/// Consent lives on `SessionStore.hasAIConsent`, so accepting at one entry point
/// unlocks the others without another prompt.
@MainActor
@Observable
final class AIConsentCoordinator {
    var isPresenting = false
    private(set) var isAccepting = false
    private(set) var errorMessage: String?
    private var pendingAction: (() -> Void)?

    /// Runs `action` immediately when consent is already recorded;
    /// otherwise defers it and shows `AIConsentGateView`.
    func presentIfNeeded(session: SessionStore, then action: @escaping () -> Void) {
        if session.hasAIConsent {
            action()
        } else {
            pendingAction = action
            errorMessage = nil
            isPresenting = true
        }
    }

    /// Records consent server-side, then runs the deferred action. On failure the
    /// gate stays open with the error so nothing runs without recorded consent.
    func accept(api: RationAPI, session: SessionStore) async {
        isAccepting = true
        errorMessage = nil
        defer { isAccepting = false }
        do {
            _ = try await api.enableAIFeatures()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return
        }
        session.markAIConsentGranted()
        isPresenting = false
        let action = pendingAction
        pendingAction = nil
        action?()
    }

    /// Dismisses the gate without recording consent or running the deferred action.
    func decline() {
        isPresenting = false
        pendingAction = nil
        errorMessage = nil
    }
}
