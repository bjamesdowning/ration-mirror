import Foundation
import Observation

enum OnboardingPhase: Equatable {
    case inactive
    case welcome
    case featureEnablement
    case askBriefing
}

/// Drives onboarding: Welcome → Feature enablement → Copilot briefing → Get Started.
@MainActor
@Observable
final class OnboardingCoordinator {
    /// Injectable patch handler for unit tests (`@testable import`).
    var settingsPatchHandler: ((SettingsPatch) async throws -> UserSettings)?

    private(set) var isActive = false
    private(set) var phase: OnboardingPhase = .inactive
    /// Settings tutorial replay — static markdown only, no LLM grant; skips Welcome/Features.
    private(set) var isStaticReplay = false
    /// When true after feature enablement, Copilot uses static briefing (AI Features off).
    private(set) var preferStaticAfterFeatures = false
    var unitDisplayMode = "metric"
    var isSaving = false
    var errorMessage: String?

    func reset() {
        isActive = false
        phase = .inactive
        isStaticReplay = false
        preferStaticAfterFeatures = false
        isSaving = false
        errorMessage = nil
        unitDisplayMode = Self.defaultUnitDisplayMode()
        settingsPatchHandler = nil
    }

    func startIfNeeded(completedAt: String?, settings: UserSettings? = nil) {
        guard completedAt == nil || completedAt?.isEmpty == true else {
            isActive = false
            phase = .inactive
            isStaticReplay = false
            return
        }
        isActive = true
        isStaticReplay = false
        preferStaticAfterFeatures = false
        phase = .welcome
        unitDisplayMode = Self.defaultUnitDisplayMode()
        if let mode = settings?.unitDisplayMode, !mode.isEmpty {
            unitDisplayMode = mode
        }
    }

    /// When Feature enablement Flagship is off, skip consent collection after Welcome.
    func skipFeatureEnablementIfDisabled(flagEnabled: Bool) {
        guard isActive, phase == .welcome || phase == .featureEnablement else { return }
        if !flagEnabled, phase == .featureEnablement {
            phase = .askBriefing
        }
    }

    func advanceFromWelcome(featureEnablementEnabled: Bool) {
        guard isActive, phase == .welcome else { return }
        if featureEnablementEnabled {
            phase = .featureEnablement
        } else {
            phase = .askBriefing
        }
    }

    func restart(staticReplay: Bool = true) {
        isActive = true
        isStaticReplay = staticReplay
        preferStaticAfterFeatures = false
        // Tutorial replay skips consent collection.
        phase = .askBriefing
        errorMessage = nil
    }

    /// Use when Ask Ration is feature-flagged off — still complete onboarding without live Copilot.
    func preferStaticBriefing() {
        guard isActive else { return }
        isStaticReplay = true
    }

    /// After feature enablement Agree. `aiEnabled` controls live vs static Copilot.
    func advanceFromFeatureEnablement(aiEnabled: Bool) {
        guard isActive, phase == .featureEnablement else { return }
        preferStaticAfterFeatures = !aiEnabled
        if !aiEnabled {
            isStaticReplay = true
        }
        phase = .askBriefing
    }

    var shouldUseStaticBriefing: Bool {
        isStaticReplay || preferStaticAfterFeatures
    }

    func complete(api: RationAPI) async -> UserSettings? {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        let iso = ISO8601DateFormatter().string(from: Date())
        let patch = SettingsPatch(
            supplyUnitMode: unitDisplayMode == "original" ? nil : unitDisplayMode,
            unitDisplayMode: unitDisplayMode,
            onboardingCompletedAt: iso,
            onboardingStep: 0
        )

        do {
            let settings = try await performPatch(patch, api: api)
            finishLocally()
            return settings
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }

    private func finishLocally() {
        isActive = false
        phase = .inactive
        isStaticReplay = false
        preferStaticAfterFeatures = false
        errorMessage = nil
    }

    private func performPatch(_ patch: SettingsPatch, api: RationAPI) async throws -> UserSettings {
        if let settingsPatchHandler {
            return try await settingsPatchHandler(patch)
        }
        return try await api.patchSettings(patch).settings
    }

    static func defaultUnitDisplayMode() -> String {
        Locale.current.measurementSystem == .us ? "imperial" : "metric"
    }
}
