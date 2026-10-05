import Foundation
import WidgetKit

enum WidgetSnapshotLoader {
    /// Returns the last good glance when the network fails. Flag-off and signed-out clear names and kcal.
    static func load(force: Bool) async -> HomeWidgetCache {
        if !force, let cached = freshCache() {
            return cached
        }
        do {
            let snapshot = try await WidgetAPI.snapshot(date: WidgetClock.localDateString())
            let cache = HomeWidgetCache(
                schema: HomeWidgetCache.currentSchema,
                state: "ready",
                snapshot: snapshot,
                fetchedAt: Date().timeIntervalSince1970,
                statusLine: nil,
                inFlightCargoIds: HomeWidgetCacheStore.load()?.inFlightCargoIds ?? []
            )
            HomeWidgetCacheStore.save(cache)
            return cache
        } catch WidgetAPIError.disabled {
            return store(state: "disabled", snapshot: nil, statusLine: nil)
        } catch WidgetAPIError.signedOut {
            return store(state: "signedOut", snapshot: nil, statusLine: nil)
        } catch {
            if var cached = HomeWidgetCacheStore.load(), cached.snapshot != nil {
                cached.statusLine = "Offline"
                return cached
            }
            return store(state: "unavailable", snapshot: nil, statusLine: nil)
        }
    }

    private static func freshCache() -> HomeWidgetCache? {
        guard let cached = HomeWidgetCacheStore.load(),
              cached.state == "ready",
              let fetched = cached.fetchedAt,
              Date().timeIntervalSince1970 - fetched < 5 * 60 else {
            return nil
        }
        return cached
    }

    private static func store(state: String, snapshot: HomeWidgetSnapshot?, statusLine: String?) -> HomeWidgetCache {
        let cache = HomeWidgetCache(
            schema: HomeWidgetCache.currentSchema,
            state: state,
            snapshot: snapshot,
            fetchedAt: Date().timeIntervalSince1970,
            statusLine: statusLine,
            inFlightCargoIds: []
        )
        HomeWidgetCacheStore.save(cache)
        return cache
    }
}

enum WidgetMutations {
    static func markPurchased(itemId: String) async {
        guard var cache = HomeWidgetCacheStore.load(), cache.isReady, var snapshot = cache.snapshot else { return }
        guard snapshot.supply.items.contains(where: { $0.id == itemId }) else { return }
        let previous = cache
        snapshot = HomeWidgetSnapshot(
            supply: .init(
                uncheckedCount: max(0, snapshot.supply.uncheckedCount - 1),
                items: snapshot.supply.items.filter { $0.id != itemId }
            ),
            ate: snapshot.ate,
            today: .init(
                status: snapshot.today.status,
                title: snapshot.today.title,
                uncheckedSupplyCount: max(0, snapshot.today.uncheckedSupplyCount - 1),
                remainingKcal: snapshot.today.remainingKcal,
                goalKcal: snapshot.today.goalKcal
            )
        )
        cache.snapshot = snapshot
        cache.statusLine = nil
        HomeWidgetCacheStore.save(cache)
        WidgetCenter.shared.reloadAllTimelines()
        do {
            try await WidgetAPI.markPurchased(itemId: itemId)
            _ = await WidgetSnapshotLoader.load(force: true)
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            HomeWidgetCacheStore.save(previous)
            var failed = previous
            failed.statusLine = "Couldn't update"
            HomeWidgetCacheStore.save(failed)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    static func eat(_ food: HomeWidgetAteFood) async {
        guard food.eatsOneStep else { return }
        let started = (try? await AppGroupFileLock.perform("widget-mutation.lock") { () -> Bool in
            guard var cache = HomeWidgetCacheStore.load(), cache.isReady else { return false }
            if cache.inFlightCargoIds.contains(food.cargoId) { return false }
            cache.inFlightCargoIds.append(food.cargoId)
            HomeWidgetCacheStore.save(cache)
            return true
        }) ?? false
        guard started else { return }
        do {
            try await WidgetAPI.quickEat(
                cargoId: food.cargoId,
                unit: food.unit,
                date: WidgetClock.localDateString(),
                operationKey: UUID().uuidString
            )
            _ = await WidgetSnapshotLoader.load(force: true)
        } catch {
            if var cache = HomeWidgetCacheStore.load() {
                cache.statusLine = "Couldn't log that bite"
                HomeWidgetCacheStore.save(cache)
            }
        }
        if var cache = HomeWidgetCacheStore.load() {
            cache.inFlightCargoIds.removeAll { $0 == food.cargoId }
            HomeWidgetCacheStore.save(cache)
        }
        WidgetCenter.shared.reloadAllTimelines()
    }
}

struct RationWidgetEntry: TimelineEntry {
    let date: Date
    let cache: HomeWidgetCache
}

struct RationWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> RationWidgetEntry {
        RationWidgetEntry(date: Date(), cache: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (RationWidgetEntry) -> Void) {
        completion(RationWidgetEntry(date: Date(), cache: .placeholder))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RationWidgetEntry>) -> Void) {
        Task {
            let cache = await WidgetSnapshotLoader.load(force: false)
            let entry = RationWidgetEntry(date: Date(), cache: cache)
            let next = Date().addingTimeInterval(30 * 60)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}
