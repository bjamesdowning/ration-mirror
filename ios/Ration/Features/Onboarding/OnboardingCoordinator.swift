import Foundation
import Observation

enum OnboardingPhase: Equatable {
    case inactive
    case askBriefing
}

/// Drives Ask-first onboarding: Copilot intro + optional starter seed, then Get Started.
@MainActor
@Observable
final class OnboardingCoordinator {
    /// Injectable patch handler for unit tests (`@testable import`).
    var settingsPatchHandler: ((SettingsPatch) async throws -> UserSettings)?

    private(set) var isActive = false
    /// Settings tutorial replay — static markdown only, no LLM grant.
    private(set) var isStaticReplay = false
    var unitDisplayMode = "metric"
    var isSaving = false
    var errorMessage: String?

    var phase: OnboardingPhase {
        isActive ? .askBriefing : .inactive
    }

    func reset() {
        isActive = false
        isStaticReplay = false
        isSaving = false
        errorMessage = nil
        unitDisplayMode = Self.defaultUnitDisplayMode()
        settingsPatchHandler = nil
    }

    func startIfNeeded(completedAt: String?, settings: UserSettings? = nil) {
        guard completedAt == nil || completedAt?.isEmpty == true else {
            isActive = false
            isStaticReplay = false
            return
        }
        isActive = true
        isStaticReplay = false
        unitDisplayMode = Self.defaultUnitDisplayMode()
        if let mode = settings?.unitDisplayMode, !mode.isEmpty {
            unitDisplayMode = mode
        }
    }

    func restart(staticReplay: Bool = true) {
        isActive = true
        isStaticReplay = staticReplay
        errorMessage = nil
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
        isStaticReplay = false
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
