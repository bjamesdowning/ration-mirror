import Foundation
import Observation

@MainActor
@Observable
final class ManifestViewModel {
    private(set) var manifest: ManifestResponse?
    private(set) var isLoading = false
    private(set) var isNavigatingWeek = false
    private(set) var isRefreshing = false
    private(set) var isSavingEntry = false
    private(set) var isTogglingSupplyDay = false
    var errorMessage: String?
    var offlineBannerMessage: String?
    var rangeStart: String = ManifestDateHelpers.todayISO()
    var selectedDay: String = ManifestDateHelpers.todayISO()
    var calendarSpan = 7
    var weekStartPref = "sunday"
    private(set) var hasInitializedAnchor = false
    private(set) var lastOrganizationId: String?
    var supplyDayInclusion: [String: Bool] = [:]
    var refreshOutcomes: SnapshotRefreshOutcomeStore?
    let share = ShareLinkController()

    /// When set, `navigateWeek` uses this instead of `api.manifest` (unit tests).
    var fetchManifestForTesting: ((String, String) async throws -> ManifestResponse)?

    private var navigationGeneration = 0
    private var navigationTask: Task<Void, Never>?

    /// Rocker / Today busy state — separate from cold `isLoading` so refresh cannot clear mid-nav.
    var isWeekNavigationBusy: Bool { isNavigatingWeek || isLoading }

    enum ConsumeOutcome: Sendable {
        case success(undoToken: String?)
        case needsConfirmation(missing: [MissingIngredientDetail])
        case failed
    }

    func applyInitialAnchorIfNeeded() {
        guard !hasInitializedAnchor else { return }
        rangeStart = ManifestDateHelpers.initialRangeStart(
            calendarSpan: calendarSpan,
            weekStartPref: weekStartPref
        )
        selectedDay = ManifestDateHelpers.todayISO()
        hasInitializedAnchor = true
    }

    func configureFromSettings(calendarSpan: Int, weekStartPref: String) {
        self.calendarSpan = calendarSpan
        self.weekStartPref = weekStartPref
        if !hasInitializedAnchor {
            applyInitialAnchorIfNeeded()
        }
    }

    func resetAnchorForOrganizationChange() {
        hasInitializedAnchor = false
        applyInitialAnchorIfNeeded()
    }

    /// Prepares anchors before a tab load. Resets the week only when the org changes —
    /// quiet revalidate / foreground refresh must keep the user's current week.
    func prepareForLoad(
        organizationId: String,
        calendarSpan: Int? = nil,
        weekStartPref: String? = nil
    ) {
        let orgChanged = lastOrganizationId != nil && lastOrganizationId != organizationId
        lastOrganizationId = organizationId
        if orgChanged {
            cancelWeekNavigation()
            share.cancel()
            resetAnchorForOrganizationChange()
        }
        if let calendarSpan, let weekStartPref {
            configureFromSettings(calendarSpan: calendarSpan, weekStartPref: weekStartPref)
        } else if !hasInitializedAnchor {
            applyInitialAnchorIfNeeded()
        }
    }

    func cancelWeekNavigation() {
        navigationGeneration += 1
        navigationTask?.cancel()
        navigationTask = nil
        isNavigatingWeek = false
    }

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        errorMessage = nil
        offlineBannerMessage = nil

        let requestedStart = rangeStart
        let endDate = ManifestDateHelpers.addDays(requestedStart, days: max(calendarSpan - 1, 0))
        let hadCache = await restoreSnapshot(
            snapshots,
            organizationId: organizationId,
            requestedStart: requestedStart,
            preserveRangeStart: online
        )
        guard rangeStart == requestedStart else { return }

        isLoading = !hadCache
        defer { isLoading = false }

        guard online else {
            if !hadCache {
                errorMessage = "You're offline and no cached manifest is available."
            }
            return
        }

        isRefreshing = hadCache
        defer { isRefreshing = false }

        do {
            let data = try await api.manifest(startDate: requestedStart, endDate: endDate)
            guard rangeStart == requestedStart else { return }
            manifest = data
            applySupplyDayInclusion(from: data)
            offlineBannerMessage = nil
            await snapshots.save(data, domain: SnapshotDomain.manifest, organizationId: organizationId)
            if let refreshOutcomes {
                SnapshotRefreshPolicy.recordRefreshSuccess(
                    outcomes: refreshOutcomes,
                    organizationId: organizationId,
                    domain: SnapshotDomain.manifest
                )
            }
        } catch {
            guard rangeStart == requestedStart else { return }
            if SnapshotRefreshPolicy.isIgnorableRefreshError(error) { return }
            if let refreshOutcomes {
                SnapshotRefreshPolicy.recordRefreshFailure(
                    outcomes: refreshOutcomes,
                    organizationId: organizationId,
                    domain: SnapshotDomain.manifest,
                    error: error
                )
            }
            let detail = SnapshotRefreshPolicy.userFacingRefreshDetail(error)
            errorMessage = hadCache
                ? SnapshotRefreshPolicy.refreshFailureMessage(feature: "Manifest", detail: detail)
                : detail
        }
    }

    /// Owns the navigation Task so rapid rocker taps cancel superseded work.
    func requestNavigateWeek(
        to start: String,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) {
        let nav = beginWeekNavigation(to: start)
        navigationTask = Task {
            await performNavigateWeek(
                to: nav.target,
                generation: nav.generation,
                api: api,
                snapshots: snapshots,
                online: online,
                organizationId: organizationId
            )
        }
    }

    /// Awaitable entry for tests; production UI should call `requestNavigateWeek`.
    func navigateWeek(
        to start: String,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async {
        let nav = beginWeekNavigation(to: start)
        await performNavigateWeek(
            to: nav.target,
            generation: nav.generation,
            api: api,
            snapshots: snapshots,
            online: online,
            organizationId: organizationId
        )
    }

    func waitForNavigationForTesting() async {
        await navigationTask?.value
    }

    private func beginWeekNavigation(to start: String) -> (target: String, generation: Int) {
        navigationTask?.cancel()
        navigationGeneration += 1
        let generation = navigationGeneration
        let target = applyOptimisticWeek(to: start)
        isNavigatingWeek = true
        return (target, generation)
    }

    @discardableResult
    private func applyOptimisticWeek(to start: String) -> String {
        let normalizedStart = ManifestDateHelpers.normalizedNavigationStart(
            start,
            calendarSpan: calendarSpan,
            weekStartPref: weekStartPref
        )
        rangeStart = normalizedStart
        selectedDay = resolvedSelectedDay(forWeekStart: normalizedStart, previousSelected: selectedDay)
        errorMessage = nil
        offlineBannerMessage = nil
        return normalizedStart
    }

    private func isCurrentNavigation(_ generation: Int) -> Bool {
        !Task.isCancelled && generation == navigationGeneration
    }

    private func performNavigateWeek(
        to normalizedStart: String,
        generation: Int,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async {
        let endDate = ManifestDateHelpers.addDays(normalizedStart, days: max(calendarSpan - 1, 0))

        defer {
            if isCurrentNavigation(generation) {
                isNavigatingWeek = false
                navigationTask = nil
            }
        }

        if online {
            do {
                let data: ManifestResponse
                if let fetchManifestForTesting {
                    data = try await fetchManifestForTesting(normalizedStart, endDate)
                } else {
                    data = try await api.manifest(startDate: normalizedStart, endDate: endDate)
                }
                guard isCurrentNavigation(generation) else { return }
                manifest = data
                applySupplyDayInclusion(from: data)
                // Re-check before disk write: another navigation may have won mid-await.
                guard isCurrentNavigation(generation) else { return }
                await snapshots.save(data, domain: SnapshotDomain.manifest, organizationId: organizationId)
                // A superseded in-flight save can finish after a newer week was cached —
                // rewrite the live week so offline restore cannot land on the stale one.
                if !isCurrentNavigation(generation),
                   let live = manifest,
                   live.startDate == rangeStart
                {
                    await snapshots.save(live, domain: SnapshotDomain.manifest, organizationId: organizationId)
                }
            } catch is CancellationError {
                return
            } catch {
                guard isCurrentNavigation(generation) else { return }
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        } else if let cached = await snapshots.load(
            ManifestResponse.self,
            domain: SnapshotDomain.manifest,
            organizationId: organizationId
        ) {
            guard isCurrentNavigation(generation) else { return }
            if cached.payload.startDate == normalizedStart {
                manifest = cached.payload
                applySupplyDayInclusion(from: cached.payload)
            } else {
                offlineBannerMessage = "Offline — no cached manifest data for this week"
            }
        } else {
            guard isCurrentNavigation(generation) else { return }
            offlineBannerMessage = "Offline — no cached manifest data for this week"
        }
    }

    private func resolvedSelectedDay(forWeekStart start: String, previousSelected: String) -> String {
        let visible = ManifestDateHelpers.calendarDates(
            span: calendarSpan,
            anchor: start,
            weekStartPref: weekStartPref
        )
        if visible.contains(previousSelected) {
            return previousSelected
        }
        if visible.contains(ManifestDateHelpers.todayISO()) {
            return ManifestDateHelpers.todayISO()
        }
        return visible.first ?? start
    }

    func isDayIncludedInSupply(_ date: String) -> Bool {
        supplyDayInclusion[date] ?? true
    }

    func toggleSupplyDay(_ date: String, api: RationAPI, online: Bool) async {
        guard online else {
            errorMessage = "Supply day toggles require a network connection."
            return
        }
        isTogglingSupplyDay = true
        defer { isTogglingSupplyDay = false }
        do {
            let result = try await api.toggleManifestDaySupply(date: date)
            supplyDayInclusion[date] = result.includedInSupply
            Haptics.light()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func consume(
        _ entry: ManifestEntry,
        confirmInsufficient: Bool = false,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async -> ConsumeOutcome {
        do {
            let result = try await api.consumeManifestEntries(
                [entry.id],
                confirmInsufficient: confirmInsufficient ? true : nil
            )
            if result.requiresConfirmation == true,
               let missing = result.missingIngredients,
               !missing.isEmpty,
               !confirmInsufficient
            {
                return .needsConfirmation(missing: missing)
            }
            Haptics.success()
            markEntryConsumedLocally(entryId: entry.id)
            let undoToken = result.undoToken
            await reloadManifestSilently(
                api: api,
                snapshots: snapshots,
                online: online,
                organizationId: organizationId
            )
            return .success(undoToken: undoToken)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return .failed
        }
    }

    func deleteEntry(
        _ entry: ManifestEntry,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async {
        guard online else {
            errorMessage = "Deleting entries requires a network connection."
            return
        }
        do {
            _ = try await api.deleteManifestEntry(entry.id)
            Haptics.light()
            removeEntryLocally(entryId: entry.id)
            await reloadManifestSilently(
                api: api,
                snapshots: snapshots,
                online: online,
                organizationId: organizationId
            )
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func removeEntryLocally(entryId: String) {
        guard let manifest else { return }
        let updated = manifest.entries.filter { $0.id != entryId }
        self.manifest = ManifestResponse(
            plan: manifest.plan,
            startDate: manifest.startDate,
            endDate: manifest.endDate,
            entries: updated,
            supplyDayInclusion: manifest.supplyDayInclusion
        )
    }

    private func markEntryConsumedLocally(entryId: String) {
        guard let manifest else { return }
        let now = Date()
        let updated = manifest.entries.map { entry -> ManifestEntry in
            guard entry.id == entryId else { return entry }
            return ManifestEntry(
                id: entry.id,
                planId: entry.planId,
                mealId: entry.mealId,
                date: entry.date,
                slotType: entry.slotType,
                orderIndex: entry.orderIndex,
                servingsOverride: entry.servingsOverride,
                notes: entry.notes,
                consumedAt: now,
                createdAt: entry.createdAt,
                mealName: entry.mealName,
                mealServings: entry.mealServings,
                mealType: entry.mealType,
                mealPrepTime: entry.mealPrepTime,
                mealCookTime: entry.mealCookTime
            )
        }
        self.manifest = ManifestResponse(
            plan: manifest.plan,
            startDate: manifest.startDate,
            endDate: manifest.endDate,
            entries: updated,
            supplyDayInclusion: manifest.supplyDayInclusion
        )
    }

    private func reloadManifestSilently(
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async {
        let endDate = ManifestDateHelpers.addDays(rangeStart, days: max(calendarSpan - 1, 0))
        guard online else { return }
        do {
            let data = try await api.manifest(startDate: rangeStart, endDate: endDate)
            manifest = data
            applySupplyDayInclusion(from: data)
            await snapshots.save(data, domain: SnapshotDomain.manifest, organizationId: organizationId)
        } catch {
            // Consume succeeded — do not surface reload failures as errors.
        }
    }

    func addEntry(
        mealId: String,
        date: String,
        slotType: String,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async -> Bool {
        guard online else {
            errorMessage = "Planning meals requires a network connection."
            return false
        }
        isSavingEntry = true
        errorMessage = nil
        defer { isSavingEntry = false }
        do {
            _ = try await api.addManifestEntry(
                ManifestEntryCreate(mealId: mealId, date: date, slotType: slotType)
            )
            Haptics.success()
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
            return true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }

    private func applySupplyDayInclusion(from manifest: ManifestResponse) {
        if let inclusion = manifest.supplyDayInclusion {
            supplyDayInclusion = inclusion
        }
    }

    @discardableResult
    private func restoreSnapshot(
        _ snapshots: SnapshotStore,
        organizationId: String,
        requestedStart: String,
        preserveRangeStart: Bool = false
    ) async -> Bool {
        guard let cached = await snapshots.load(ManifestResponse.self, domain: SnapshotDomain.manifest, organizationId: organizationId) else {
            return false
        }
        manifest = cached.payload
        applySupplyDayInclusion(from: cached.payload)
        if !preserveRangeStart,
           !requestedStart.isEmpty,
           cached.payload.startDate != requestedStart {
            let formatted = ManifestDateHelpers.formatRange(
                start: cached.payload.startDate,
                end: cached.payload.endDate
            )
            offlineBannerMessage = "Offline — showing cached week \(formatted)"
        }
        if !preserveRangeStart {
            rangeStart = cached.payload.startDate
            selectedDay = resolvedSelectedDay(forWeekStart: cached.payload.startDate, previousSelected: selectedDay)
        }
        return true
    }
}

