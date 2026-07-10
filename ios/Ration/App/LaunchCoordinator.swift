import Foundation
import Observation

/// Owns one-shot startup work per signed-in identity: session + settings fetch,
/// onboarding derivation, and shell-ready signaling.
@MainActor
@Observable
final class LaunchCoordinator {
    enum Phase: Equatable {
        case idle
        case loading
        case ready
        case failed(String)
    }

    private(set) var userSettings: UserSettings?
    private(set) var phase: Phase = .idle
    private(set) var startupGeneration = 0
    private var loadedForGeneration: Int?

    var isStartupComplete: Bool {
        phase == .ready
    }

    var needsOnboarding: Bool {
        guard phase == .ready, let userSettings else { return false }
        return userSettings.onboardingCompletedAt?.isEmpty != false
    }

    func reset() {
        startupGeneration += 1
        userSettings = nil
        phase = .idle
        loadedForGeneration = nil
    }

    func retry() {
        reset()
    }

    /// Loads session and settings once per startup generation.
    func performStartup(
        api: RationAPI,
        session: SessionStore,
        theme: ThemeStore,
        unitDisplayMode: UnitDisplayModeStore
    ) async {
        await performStartup(
            loadSession: {
                let loaded = await session.load(api: api)
                return loaded && session.activeOrganizationId != nil
            },
            loadSettings: {
                await self.fetchSettings(api: api)
            },
            applySettings: { settings in
                session.applyConsent(settings)
                theme.syncFromServer(settings)
                unitDisplayMode.syncFromServer(settings)
            }
        )
    }

    func performStartup(
        loadSession: @escaping () async -> Bool,
        loadSettings: @escaping () async -> UserSettings?,
        applySettings: (UserSettings) -> Void
    ) async {
        guard loadedForGeneration != startupGeneration else { return }
        let generation = startupGeneration
        loadedForGeneration = generation
        phase = .loading

        async let sessionLoaded = loadSession()
        async let settingsResult = loadSettings()
        let (didLoadSession, settings) = await (sessionLoaded, settingsResult)

        guard generation == startupGeneration else { return }
        guard !Task.isCancelled else {
            loadedForGeneration = nil
            phase = .idle
            return
        }
        guard didLoadSession else {
            loadedForGeneration = nil
            phase = .failed("Could not load your active organization. Check your connection and try again.")
            return
        }
        guard let settings else {
            loadedForGeneration = nil
            phase = .failed("Could not load your preferences. Check your connection and try again.")
            return
        }

        userSettings = settings
        applySettings(settings)
        phase = .ready
    }

    private func fetchSettings(api: RationAPI) async -> UserSettings? {
        do {
            return try await api.settings().settings
        } catch {
            return nil
        }
    }
}
