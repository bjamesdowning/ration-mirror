import Foundation
import Observation

/// Server calls the exporter needs. `RationAPI` is the production backend.
@MainActor
protocol HealthExportBackend: AnyObject {
    func healthExportPending(since: String?, scope: String?) async throws -> HealthExportPendingResponse
    func acknowledgeHealthExportClear() async throws
}

/// Who is signed in and whether this build may show Apple Health at all.
struct HealthExportContext: Equatable, Sendable {
    var userId: String
    var flagVisible: Bool
}

/// Keeps Apple Health current from the server's diary, on this iPhone only.
/// One sync runs at a time; a trigger during a run queues one more run.
@MainActor
@Observable
final class HealthExportCoordinator {
    enum Reason: Equatable, Sendable {
        case sessionReady
        case sceneActive
        case diaryChanged
        case backgroundRefresh
        case manual
        /// The person just turned export on: copy everything in the window.
        case enabled

        /// Passive triggers skip the network unless export was on last time.
        var isPassive: Bool {
            switch self {
            case .sceneActive, .diaryChanged, .backgroundRefresh: true
            case .sessionReady, .manual, .enabled: false
            }
        }

        var forcesFullSync: Bool {
            self == .manual || self == .enabled
        }
    }

    static let sceneDebounce: TimeInterval = 30

    private(set) var isSyncing = false
    private(set) var lastSyncedAt: Date?
    /// A message for Settings when the last run failed outright.
    private(set) var lastError: String?
    /// Foods (nutrient samples) that did not save on the last run.
    private(set) var lastFailures = 0
    /// Nutrients the person turned off for Ration in the Health app.
    private(set) var lastUnauthorized = 0
    /// Foods kept out of Health on the last full sync (AI estimates, meals).
    private(set) var excluded = 0

    /// Set by `AppEnvironment`. Nil while signed out.
    var contextProvider: () -> HealthExportContext? = { nil }

    private let store: HealthSampleWriting
    private let backend: HealthExportBackend
    private let defaults: UserDefaults
    private let now: () -> Date
    private var inFlight: Task<Void, Never>?
    private var queued: Reason?
    private var lastSceneTrigger: Date?

    init(
        store: HealthSampleWriting,
        backend: HealthExportBackend,
        defaults: UserDefaults = .standard,
        now: @escaping () -> Date = Date.init
    ) {
        self.store = store
        self.backend = backend
        self.defaults = defaults
        self.now = now
    }

    /// True when a background refresh is worth scheduling.
    var wantsBackgroundRefresh: Bool {
        guard let context = contextProvider(), context.flagVisible else { return false }
        return state(for: context.userId).lastEnabled
    }

    /// Fire and forget. Safe to call from any trigger, any number of times.
    func trigger(_ reason: Reason) {
        if reason == .sceneActive {
            let current = now()
            if let last = lastSceneTrigger,
               current.timeIntervalSince(last) < Self.sceneDebounce {
                return
            }
            lastSceneTrigger = current
        }
        if inFlight != nil {
            if queued == nil || reason.forcesFullSync {
                queued = reason
            }
            return
        }
        inFlight = Task { [weak self] in
            await self?.run(reason)
            self?.finishRun()
        }
    }

    /// Triggers and waits for this run and any queued run to finish.
    func sync(_ reason: Reason) async {
        trigger(reason)
        while let task = inFlight {
            await task.value
        }
    }

    /// Settings shows these for the signed-in person after relaunch.
    func restoreDisplayedState() {
        guard let context = contextProvider() else { return }
        let state = self.state(for: context.userId)
        lastSyncedAt = state.lastSyncedAt
        excluded = state.lastExcluded
    }

    /// Removes every Ration sample for this account from this iPhone
    /// (turn off and remove, clear, account deletion). Works while export
    /// is off. Returns false when anything could not be removed.
    func purgeAll(prefetched: HealthExportPendingResponse? = nil) async -> Bool {
        while let task = inFlight {
            await task.value
        }
        guard let context = contextProvider() else { return false }
        let allowed = store.authorizedTypes()
        guard !allowed.isEmpty else { return false }
        isSyncing = true
        defer { isSyncing = false }
        do {
            let pending: HealthExportPendingResponse
            if let prefetched {
                pending = prefetched
            } else {
                pending = try await backend.healthExportPending(since: nil, scope: "all")
            }
            let plan = HealthExportDevicePlan.make(
                samples: [],
                deletes: pending.deletes,
                authorizedTypes: allowed
            )
            _ = try await HealthExportApplier.apply(plan, store: store)
            if pending.clearRequested == true {
                try? await backend.acknowledgeHealthExportClear()
            }
            // The next sync after turning back on is a full copy.
            state(for: context.userId).syncedThrough = nil
            return allowed.count == HealthExportPolicy.quantityTypes.count
        } catch {
            lastError = Self.message(for: error)
            return false
        }
    }

    /// Turning export off (with or without removal) forgets this account's sync state.
    func forget() {
        if let context = contextProvider() {
            state(for: context.userId).clear()
        }
        resetDisplayedState()
    }

    /// Sign-out: nothing from the previous person stays on screen.
    func resetDisplayedState() {
        lastSyncedAt = nil
        lastError = nil
        lastFailures = 0
        lastUnauthorized = 0
        excluded = 0
    }

    private func finishRun() {
        inFlight = nil
        if let next = queued {
            queued = nil
            trigger(next)
        }
    }

    private func state(for userId: String) -> HealthExportSyncState {
        HealthExportSyncState(defaults: defaults, userId: userId)
    }

    private func run(_ reason: Reason) async {
        guard let context = contextProvider(), context.flagVisible else { return }
        let state = self.state(for: context.userId)
        if reason.isPassive, !state.lastEnabled { return }
        let allowed = store.authorizedTypes()
        guard !allowed.isEmpty else {
            if !reason.isPassive, state.lastEnabled || reason == .enabled {
                lastError = "Allow Apple Health access for Ration on this iPhone."
            }
            return
        }
        isSyncing = true
        defer { isSyncing = false }
        do {
            let repair = state.needsRepair
            let full = reason.forcesFullSync || repair || state.syncedThrough == nil
            var pending = try await backend.healthExportPending(
                since: full ? nil : HealthExportSince.make(syncedThrough: state.syncedThrough),
                scope: nil
            )
            var fullPull = full
            if pending.truncated == true {
                pending = try await backend.healthExportPending(since: nil, scope: nil)
                fullPull = true
            }
            let enabled = pending.enabled ?? false
            let purge = pending.purge ?? false
            state.lastEnabled = enabled
            guard enabled || purge else {
                lastError = nil
                return
            }
            let plan = HealthExportDevicePlan.make(
                samples: purge ? [] : pending.samples,
                deletes: pending.deletes,
                authorizedTypes: allowed,
                repair: repair && fullPull && !purge
            )
            let result = try await HealthExportApplier.apply(plan, store: store)
            if purge {
                if pending.clearRequested == true {
                    try await backend.acknowledgeHealthExportClear()
                }
                // Writes resume with a full copy on the next run.
                state.syncedThrough = nil
                if enabled { queued = queued ?? .sessionReady }
            } else if result.failed == 0 {
                state.syncedThrough = pending.syncedThrough
                if repair, fullPull {
                    state.schemaVersion = HealthExportSyncState.currentSchemaVersion
                }
            }
            if fullPull, !purge, let counts = pending.excluded {
                excluded = counts.total
                state.lastExcluded = counts.total
            }
            let finished = now()
            state.lastSyncedAt = finished
            lastSyncedAt = finished
            lastFailures = result.failed
            lastUnauthorized = result.unauthorized
            lastError = nil
        } catch {
            if Self.isQuiet(error) {
                lastError = nil
            } else {
                lastError = Self.message(for: error)
            }
        }
    }

    /// Flag off, consent missing, or an older client: nothing to report.
    private static func isQuiet(_ error: Error) -> Bool {
        guard let apiError = error as? APIError else { return false }
        return apiError.isFeatureDisabled || apiError.isNutritionConsentRequired
    }

    private static func message(for error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
}
