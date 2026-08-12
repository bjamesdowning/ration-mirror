import Foundation
import Observation

enum NutritionLoadState: Equatable {
    case idle
    case loading
    case cached(summary: NutritionSummary, syncedAt: Date, offline: Bool)
    case refreshing(summary: NutritionSummary)
    case current(summary: NutritionSummary, generatedAt: Date)
    case failed(cached: NutritionSummary?, message: String)

    var summary: NutritionSummary? {
        switch self {
        case .idle, .loading:
            return nil
        case let .cached(summary, _, _),
             let .refreshing(summary),
             let .current(summary, _):
            return summary
        case let .failed(cached, _):
            return cached
        }
    }

    var isOfflineCached: Bool {
        if case let .cached(_, _, offline) = self { return offline }
        return false
    }
}

/// Shared nutrition summary cache — private user+org snapshots, coalesced reads, Eat patches.
@MainActor
@Observable
final class NutritionStore {
    private(set) var loadState: NutritionLoadState = .idle

    private let snapshots: SnapshotStore
    private var userId: String?
    private var organizationId: String?
    private var generation = 0
    private var inFlight: [String: Task<NutritionSummary?, Never>] = [:]
    /// In-memory range cache (also mirrored to disk under `nutrition-summary`).
    private var summariesByRange: [String: NutritionSummary] = [:]
    private var syncedAtByRange: [String: Date] = [:]

    init(snapshots: SnapshotStore) {
        self.snapshots = snapshots
    }

    func configure(userId: String, organizationId: String, crossOrgDiary: Bool = false) {
        // Cross-org diary shares one personal cache across kitchen switches.
        let scopeOrganizationId = crossOrgDiary ? "_cross_org_diary_" : organizationId
        if self.userId != userId || self.organizationId != scopeOrganizationId {
            bumpGeneration()
            self.userId = userId
            self.organizationId = scopeOrganizationId
        }
    }

    func invalidate() {
        bumpGeneration()
        userId = nil
        organizationId = nil
    }

    var summary: NutritionSummary? { loadState.summary }

    /// Loads (or revalidates) a summary for an inclusive date range.
    @discardableResult
    func loadSummary(
        from: String,
        to: String,
        api: RationAPI,
        online: Bool
    ) async -> NutritionSummary? {
        let rangeKey = Self.rangeKey(from: from, to: to)
        let gen = generation

        if let existing = inFlight[rangeKey] {
            return await existing.value
        }

        let task = Task<NutritionSummary?, Never> { [weak self] in
            guard let self else { return nil }
            return await self.performLoad(
                from: from,
                to: to,
                rangeKey: rangeKey,
                api: api,
                online: online,
                generation: gen
            )
        }
        inFlight[rangeKey] = task
        let result = await task.value
        inFlight[rangeKey] = nil
        return result
    }

    /// Patches cached summaries (and current load state) with authoritative Eat/clear day totals.
    func applyDayTotals(
        _ totals: [NutritionDayTotals],
        forRange from: String,
        to: String
    ) {
        guard !totals.isEmpty else { return }
        let gen = generation
        var touchedKeys: [String] = []

        for (key, summary) in summariesByRange {
            let patched = NutritionSummaryReducer.applyingDayTotals(
                summary,
                dayTotals: totals,
                from: from,
                to: to
            )
            if patched != summary {
                summariesByRange[key] = patched
                syncedAtByRange[key] = Date()
                touchedKeys.append(key)
            }
        }

        // Ensure the requested range exists even if it was never loaded.
        // Expand to full from...to with empty days so week totals are not under-seeded
        // when Eat only returns the touched day(s).
        let requestKey = Self.rangeKey(from: from, to: to)
        if summariesByRange[requestKey] == nil {
            let empty = NutritionSummary(
                from: from,
                to: to,
                totals: NutritionSummary.Totals(
                    energyKcal: 0,
                    proteinG: 0,
                    carbsG: 0,
                    fatG: 0,
                    fiberG: nil
                ),
                days: LocalDay.isoDates(from: from, to: to).map {
                    NutritionDayTotals.empty(date: $0)
                },
                goal: loadState.summary?.goal
            )
            let seed = NutritionSummaryReducer.applyingDayTotals(
                empty,
                dayTotals: totals,
                from: from,
                to: to
            )
            summariesByRange[requestKey] = seed
            syncedAtByRange[requestKey] = Date()
            touchedKeys.append(requestKey)
        }

        if let current = loadState.summary {
            let patched = NutritionSummaryReducer.applyingDayTotals(
                current,
                dayTotals: totals,
                from: from,
                to: to
            )
            if patched != current {
                loadState = .current(summary: patched, generatedAt: Date())
                let key = Self.rangeKey(from: patched.from, to: patched.to)
                summariesByRange[key] = patched
                syncedAtByRange[key] = Date()
                if !touchedKeys.contains(key) {
                    touchedKeys.append(key)
                }
            }
        } else if let seeded = summariesByRange[requestKey] {
            loadState = .current(summary: seeded, generatedAt: Date())
        }

        guard gen == generation, let scope = privateScope else { return }
        Task {
            await persistCache(scope: scope, generation: gen)
        }
    }

    private func performLoad(
        from: String,
        to: String,
        rangeKey: String,
        api: RationAPI,
        online: Bool,
        generation gen: Int
    ) async -> NutritionSummary? {
        await restoreRangeIfNeeded(rangeKey: rangeKey, generation: gen)

        if let cached = summariesByRange[rangeKey] {
            let synced = syncedAtByRange[rangeKey] ?? Date.distantPast
            if online {
                loadState = .refreshing(summary: cached)
            } else {
                loadState = .cached(summary: cached, syncedAt: synced, offline: true)
                return cached
            }
        } else if online {
            loadState = .loading
        } else {
            loadState = .failed(cached: nil, message: "You're offline and no cached nutrition summary is available.")
            return nil
        }

        guard online else { return summariesByRange[rangeKey] }

        do {
            let summary = try await api.nutritionSummary(from: from, to: to)
            guard gen == generation else { return nil }
            summariesByRange[rangeKey] = summary
            syncedAtByRange[rangeKey] = Date()
            loadState = .current(summary: summary, generatedAt: Date())
            if let scope = privateScope {
                await persistCache(scope: scope, generation: gen)
            }
            return summary
        } catch let apiError as APIError where apiError.isFeatureDisabled {
            guard gen == generation else { return nil }
            summariesByRange.removeValue(forKey: rangeKey)
            syncedAtByRange.removeValue(forKey: rangeKey)
            loadState = .idle
            return nil
        } catch let apiError as APIError where apiError.isNutritionUpdating {
            guard gen == generation else { return nil }
            if let cached = summariesByRange[rangeKey] {
                loadState = .cached(
                    summary: cached,
                    syncedAt: syncedAtByRange[rangeKey] ?? Date(),
                    offline: false
                )
                return cached
            }
            loadState = .failed(
                cached: nil,
                message: apiError.errorDescription ?? "Nutrition totals are still updating. Try again shortly."
            )
            return nil
        } catch {
            guard gen == generation else { return nil }
            if let cached = summariesByRange[rangeKey] {
                loadState = .cached(
                    summary: cached,
                    syncedAt: syncedAtByRange[rangeKey] ?? Date(),
                    offline: false
                )
                return cached
            }
            let message = (error as? APIError)?.errorDescription ?? error.localizedDescription
            loadState = .failed(cached: nil, message: message)
            return nil
        }
    }

    private func restoreRangeIfNeeded(rangeKey: String, generation gen: Int) async {
        guard summariesByRange[rangeKey] == nil, let scope = privateScope else { return }
        guard let cached = await snapshots.load(
            NutritionSummaryDiskCache.self,
            domain: SnapshotDomain.nutritionSummary,
            scope: scope
        ) else { return }
        guard gen == generation else { return }
        for (key, summary) in cached.payload.summaries {
            if summariesByRange[key] == nil {
                summariesByRange[key] = summary
            }
            if syncedAtByRange[key] == nil {
                syncedAtByRange[key] = cached.metadata.syncedAt
            }
        }
    }

    private func persistCache(scope: SnapshotScope, generation gen: Int) async {
        guard gen == generation else { return }
        let payload = NutritionSummaryDiskCache(summaries: summariesByRange)
        await snapshots.save(payload, domain: SnapshotDomain.nutritionSummary, scope: scope)
    }

    private func bumpGeneration() {
        generation += 1
        for (_, task) in inFlight {
            task.cancel()
        }
        inFlight = [:]
        summariesByRange = [:]
        syncedAtByRange = [:]
        loadState = .idle
    }

    private var privateScope: SnapshotScope? {
        guard let userId, let organizationId else { return nil }
        return .userOrganization(userId: userId, organizationId: organizationId)
    }

    private static func rangeKey(from: String, to: String) -> String {
        "\(from)|\(to)"
    }
}

struct NutritionSummaryDiskCache: Codable, Sendable {
    var summaries: [String: NutritionSummary]
}
