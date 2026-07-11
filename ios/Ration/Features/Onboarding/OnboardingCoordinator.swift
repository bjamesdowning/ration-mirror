import Foundation
import Observation

enum OnboardingPhase: Equatable {
    case inactive
    case welcome
    case contextual
    case launch
}

/// Drives the 7-step onboarding tour (steps 0–6), persistence, and shell routing hints.
@MainActor
@Observable
final class OnboardingCoordinator {
    /// Injectable patch handler for unit tests (`@testable import`).
    var settingsPatchHandler: ((SettingsPatch) async throws -> UserSettings)?

    private(set) var step = 0
    private(set) var isActive = false
    var unitDisplayMode = "metric"
    var isSaving = false
    var errorMessage: String?

    var phase: OnboardingPhase {
        guard isActive else { return .inactive }
        if step == 0 { return .welcome }
        if step == OnboardingCopy.lastStepIndex { return .launch }
        return .contextual
    }

    var isContextualPhase: Bool { phase == .contextual }

    var highlightedTab: Int? {
        OnboardingCopy.highlightedTab(for: step)
    }

    var shouldOpenGroupSettings: Bool {
        OnboardingCopy.shouldOpenGroupSettings(for: step)
    }

    func reset() {
        step = 0
        isActive = false
        isSaving = false
        errorMessage = nil
        unitDisplayMode = "metric"
        settingsPatchHandler = nil
    }

    /// Starts the tour when onboarding is incomplete; resumes from server step when present.
    func startIfNeeded(completedAt: String?, initialStep: Int?, settings: UserSettings? = nil) {
        guard completedAt == nil || completedAt?.isEmpty == true else {
            isActive = false
            return
        }
        isActive = true
        step = Self.clampedStep(initialStep ?? 0)
        if let mode = settings?.unitDisplayMode, !mode.isEmpty {
            unitDisplayMode = mode
        }
    }

    /// Replays the tour from Settings (after server clears completion).
    func restart(fromServerStep: Int = 0) {
        isActive = true
        step = Self.clampedStep(fromServerStep)
        errorMessage = nil
    }

    func beginTour(api: RationAPI) async -> UserSettings? {
        await persistAndAdvance(to: 1, api: api, includeUnits: true)
    }

    func advance(api: RationAPI) async -> UserSettings? {
        guard step < OnboardingCopy.lastStepIndex else { return nil }
        let next = step + 1
        return await persistAndAdvance(to: next, api: api, includeUnits: step == 0)
    }

    func goBack(api: RationAPI) async -> UserSettings? {
        guard step > 0 else { return nil }
        let previous = step - 1
        return await persistStep(previous, api: api)
    }

    func skip(api: RationAPI) async -> UserSettings? {
        guard let settings = await persistCompletion(api: api, atStep: step) else {
            return nil
        }
        finishLocally()
        return settings
    }

    func complete(api: RationAPI) async -> UserSettings? {
        guard let settings = await persistCompletion(
            api: api,
            atStep: OnboardingCopy.lastStepIndex
        ) else {
            return nil
        }
        finishLocally()
        return settings
    }

    private func finishLocally() {
        isActive = false
        errorMessage = nil
    }

    private func persistStep(_ targetStep: Int, api: RationAPI) async -> UserSettings? {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            let settings = try await performPatch(
                SettingsPatch(onboardingStep: targetStep),
                api: api
            )
            step = targetStep
            return settings
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }

    private func persistAndAdvance(to nextStep: Int, api: RationAPI, includeUnits: Bool) async -> UserSettings? {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        var patch = SettingsPatch(onboardingStep: nextStep)
        if includeUnits {
            patch.unitDisplayMode = unitDisplayMode
            patch.supplyUnitMode = unitDisplayMode == "original" ? nil : unitDisplayMode
        }

        do {
            let settings = try await performPatch(patch, api: api)
            applyUnitSync(from: settings)
            step = nextStep
            return settings
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }

    private func persistCompletion(api: RationAPI, atStep: Int) async -> UserSettings? {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        let iso = ISO8601DateFormatter().string(from: Date())
        let patch = SettingsPatch(
            onboardingCompletedAt: iso,
            onboardingStep: atStep
        )

        do {
            return try await performPatch(patch, api: api)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }

    private func performPatch(_ patch: SettingsPatch, api: RationAPI) async throws -> UserSettings {
        if let settingsPatchHandler {
            return try await settingsPatchHandler(patch)
        }
        return try await api.patchSettings(patch).settings
    }

    private func applyUnitSync(from settings: UserSettings) {
        if let mode = settings.unitDisplayMode, !mode.isEmpty {
            unitDisplayMode = mode
        }
    }

    static func clampedStep(_ value: Int) -> Int {
        min(max(value, 0), OnboardingCopy.lastStepIndex)
    }
}
