import Foundation
import WidgetKit

struct RationWidgetEntry: TimelineEntry {
    let date: Date
    let cache: HomeWidgetCache
    let appearance: WidgetAppearance
    let eatTagSlug: String?
    let eatTagName: String?
}

enum WidgetSnapshotLoader {
    /// Returns the last good glance when the network fails. Flag-off and signed-out clear names and kcal.
    static func load(force: Bool, tag: String?) async -> HomeWidgetCache {
        if !force, let cached = freshCache(tag: tag) {
            return cached
        }
        do {
            let snapshot = try await WidgetAPI.snapshot(date: WidgetClock.localDateString(), tag: tag)
            return await merge(snapshot, tag: tag, statusLine: nil, state: "ready")
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

    private static func freshCache(tag: String?) -> HomeWidgetCache? {
        guard let cached = HomeWidgetCacheStore.load(), cached.state == "ready" else { return nil }
        let now = Date().timeIntervalSince1970
        if let tag {
            guard let fetched = cached.tagFetchedAt[tag], now - fetched < 5 * 60 else { return nil }
            return cached
        }
        guard let fetched = cached.fetchedAt, now - fetched < 5 * 60 else { return nil }
        return cached
    }

    private static func merge(
        _ snapshot: HomeWidgetSnapshot,
        tag: String?,
        statusLine: String?,
        state: String
    ) async -> HomeWidgetCache {
        let merged = try? await AppGroupFileLock.perform("widget-snapshot.lock") { () -> HomeWidgetCache in
            var cache = HomeWidgetCacheStore.load() ?? .empty(state: state, statusLine: nil)
            cache.schema = HomeWidgetCache.currentSchema
            cache.state = state
            cache.statusLine = statusLine
            let now = Date().timeIntervalSince1970
            if let tag {
                var slice = snapshot.eat
                slice.tagChoices = cache.snapshot?.eat.tagChoices ?? []
                cache.eatByTag[tag] = slice
                cache.tagFetchedAt[tag] = now
                if var base = cache.snapshot {
                    base.supply = snapshot.supply
                    base.today = snapshot.today
                    cache.snapshot = base
                } else {
                    var unfiltered = snapshot
                    unfiltered.eat.foods = []
                    unfiltered.eat.tagChoices = []
                    cache.snapshot = unfiltered
                }
            } else {
                cache.snapshot = snapshot
                cache.fetchedAt = now
            }
            HomeWidgetCacheStore.save(cache)
            return cache
        }
        return merged ?? store(state: state, snapshot: snapshot, statusLine: statusLine)
    }

    private static func store(state: String, snapshot: HomeWidgetSnapshot?, statusLine: String?) -> HomeWidgetCache {
        let cache = HomeWidgetCache.empty(state: state, statusLine: statusLine)
        var stored = cache
        stored.snapshot = snapshot
        HomeWidgetCacheStore.save(stored)
        return stored
    }
}

enum WidgetMutations {
    static func markPurchased(itemId: String) async {
        let previous = HomeWidgetCacheStore.load()
        let started = await mutate { cache -> Bool in
            guard cache.isReady, var snapshot = cache.snapshot else { return false }
            guard cache.supplyHold?.id != itemId else { return false }
            guard let item = snapshot.supply.items.first(where: { $0.id == itemId }) else { return false }
            snapshot.supply.uncheckedCount = max(0, snapshot.supply.uncheckedCount - 1)
            snapshot.today.uncheckedSupplyCount = max(0, snapshot.today.uncheckedSupplyCount - 1)
            cache.snapshot = snapshot
            cache.supplyHold = WidgetHold(
                id: item.id,
                name: item.name,
                until: Date().addingTimeInterval(WidgetHold.duration).timeIntervalSince1970,
                quantity: nil,
                unit: nil
            )
            cache.statusLine = nil
            return true
        }
        guard started else { return }
        WidgetCenter.shared.reloadAllTimelines()
        do {
            try await WidgetAPI.markPurchased(itemId: itemId)
            _ = await WidgetSnapshotLoader.load(force: true, tag: nil)
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            await mutate { cache in
                if var snapshot = cache.snapshot, let previous, let supply = previous.snapshot?.supply {
                    snapshot.supply = supply
                    snapshot.today.uncheckedSupplyCount = previous.snapshot?.today.uncheckedSupplyCount ?? snapshot.today.uncheckedSupplyCount
                    cache.snapshot = snapshot
                }
                cache.supplyHold = nil
                cache.statusLine = "Couldn't update"
                return true
            }
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    static func eat(_ food: HomeWidgetEatFood) async {
        guard food.eatsOneStep else { return }
        let started = await mutate { cache -> Bool in
            guard cache.isReady else { return false }
            if cache.inFlightCargoIds.contains(food.cargoId) { return false }
            if cache.eatHold?.id == food.cargoId, cache.eatHold?.isActive(at: Date()) == true { return false }
            cache.inFlightCargoIds.append(food.cargoId)
            cache.statusLine = nil
            return true
        }
        guard started else { return }
        WidgetCenter.shared.reloadAllTimelines()
        do {
            try await WidgetAPI.quickEat(
                cargoId: food.cargoId,
                unit: food.unit,
                date: WidgetClock.localDateString(),
                operationKey: UUID().uuidString
            )
            let nextQuantity = max(0, food.quantity - food.stepQuantity)
            await mutate { cache in
                cache.inFlightCargoIds.removeAll { $0 == food.cargoId }
                cache.eatHold = WidgetHold(
                    id: food.cargoId,
                    name: food.name,
                    until: Date().addingTimeInterval(WidgetHold.duration).timeIntervalSince1970,
                    quantity: nextQuantity,
                    unit: food.unit
                )
                if var snapshot = cache.snapshot {
                    snapshot.eat.foods = replacingQuantity(snapshot.eat.foods, cargoId: food.cargoId, quantity: nextQuantity)
                    cache.snapshot = snapshot
                }
                for key in Array(cache.eatByTag.keys) {
                    guard var slice = cache.eatByTag[key] else { continue }
                    slice.foods = replacingQuantity(slice.foods, cargoId: food.cargoId, quantity: nextQuantity)
                    cache.eatByTag[key] = slice
                }
                cache.statusLine = nil
                return true
            }
            _ = await WidgetSnapshotLoader.load(force: true, tag: nil)
        } catch {
            await mutate { cache in
                cache.inFlightCargoIds.removeAll { $0 == food.cargoId }
                cache.eatHold = nil
                cache.statusLine = "Couldn't log that bite"
                return true
            }
        }
        WidgetCenter.shared.reloadAllTimelines()
    }

    private static func replacingQuantity(
        _ foods: [HomeWidgetEatFood],
        cargoId: String,
        quantity: Double
    ) -> [HomeWidgetEatFood] {
        foods.map { $0.cargoId == cargoId ? $0.withQuantity(quantity) : $0 }
    }

    @discardableResult
    private static func mutate(_ work: @escaping (inout HomeWidgetCache) -> Bool) async -> Bool {
        let changed = try? await AppGroupFileLock.perform("widget-snapshot.lock") { () -> Bool in
            guard var cache = HomeWidgetCacheStore.load() else { return false }
            let did = work(&cache)
            if did { HomeWidgetCacheStore.save(cache) }
            return did
        }
        return changed ?? false
    }
}

enum WidgetTimelines {
    static func make(
        cache: HomeWidgetCache,
        appearance: WidgetAppearance,
        eatTagSlug: String?,
        eatTagName: String?
    ) -> Timeline<RationWidgetEntry> {
        let now = Date()
        let current = settled(cache, at: now)
        var entries = [
            RationWidgetEntry(
                date: now,
                cache: current,
                appearance: appearance,
                eatTagSlug: eatTagSlug,
                eatTagName: eatTagName
            ),
        ]
        let untils = [current.supplyHold?.until, current.eatHold?.until]
            .compactMap { $0 }
            .filter { $0 > now.timeIntervalSince1970 }
        if let until = untils.min() {
            let when = Date(timeIntervalSince1970: until)
            entries.append(
                RationWidgetEntry(
                    date: when,
                    cache: settled(current, at: when.addingTimeInterval(0.05)),
                    appearance: appearance,
                    eatTagSlug: eatTagSlug,
                    eatTagName: eatTagName
                )
            )
        }
        return Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60)))
    }

    private static func settled(_ cache: HomeWidgetCache, at date: Date) -> HomeWidgetCache {
        var cache = cache
        if let hold = cache.supplyHold, !hold.isActive(at: date) {
            cache.snapshot?.supply.items.removeAll { $0.id == hold.id }
            cache.supplyHold = nil
        }
        if let hold = cache.eatHold, !hold.isActive(at: date) {
            cache.eatHold = nil
        }
        return cache
    }
}
