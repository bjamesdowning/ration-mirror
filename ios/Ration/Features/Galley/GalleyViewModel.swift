import Foundation
import Observation

@MainActor
@Observable
final class GalleyViewModel {
    private(set) var meals: [Meal] = []
    private(set) var matches: [MealMatch] = []
    private(set) var matchByMealId: [String: MealMatch] = [:]
    private(set) var mealTotal = 0
    private(set) var matchTotal = 0
    private(set) var isLoading = false
    var errorMessage: String?

    var isMatchMode: Bool { filters.matchingEnabled }

    var filters = PageFilterState(configuration: PageFilterConfiguration(
        supportsDomain: true,
        supportsTags: true,
        supportsSearch: true,
        supportsMatching: true
    ))

    var displayedMeals: [Meal] {
        PageFilterEngine.filterMeals(meals, domain: filters.domain, tag: filters.tag, search: filters.search)
    }

    var displayedMatches: [MealMatch] {
        let filtered = PageFilterEngine.filterMeals(
            matches.map(\.meal),
            domain: filters.domain,
            tag: filters.tag,
            search: filters.search
        )
        let ids = Set(filtered.map(\.id))
        return matches.filter { ids.contains($0.meal.id) }
    }

    var isSearchActive: Bool {
        !filters.search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var listHeaderCount: Int {
        isMatchMode ? matchTotal : mealTotal
    }

    func match(for mealId: String) -> MealMatch? {
        matchByMealId[mealId]
    }

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if online {
            do {
                if isMatchMode {
                    let response = try await api.matchMeals(limit: 200, minMatch: 0)
                    matches = response.matches
                    matchTotal = response.total ?? response.matches.count
                    matchByMealId = GalleyMatchMapBuilder.build(from: response.matches)
                } else {
                    async let mealsTask = api.meals(tag: filters.tag, domain: filters.domain)
                    async let matchTask = api.matchMeals(limit: 200, minMatch: 0)
                    let (mealsResponse, matchResponse) = try await (mealsTask, matchTask)
                    meals = mealsResponse.meals
                    mealTotal = mealsResponse.total ?? mealsResponse.meals.count
                    matchByMealId = GalleyMatchMapBuilder.build(from: matchResponse.matches)
                    snapshots.save(mealsResponse, domain: SnapshotDomain.galley, organizationId: organizationId)
                }
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                restoreSnapshot(snapshots, organizationId: organizationId)
            }
        } else {
            matchByMealId = [:]
            restoreSnapshot(snapshots, organizationId: organizationId)
        }
    }

    func refreshAvailabilityMatches(api: RationAPI, online: Bool) async {
        guard online else {
            matchByMealId = [:]
            return
        }
        do {
            let response = try await api.matchMeals(limit: 200, minMatch: 0)
            if isMatchMode {
                matches = response.matches
                matchTotal = response.total ?? response.matches.count
            }
            matchByMealId = GalleyMatchMapBuilder.build(from: response.matches)
        } catch {
            // Non-fatal — keep existing gauges until next full reload.
        }
    }

    private func restoreSnapshot(_ snapshots: SnapshotStore, organizationId: String) {
        if let cached = snapshots.load(MealsResponse.self, domain: SnapshotDomain.galley, organizationId: organizationId) {
            meals = cached.payload.meals
            mealTotal = cached.payload.total ?? cached.payload.meals.count
        }
    }

    func cook(_ mealId: String, api: RationAPI) async {
        do {
            _ = try await api.cookMeal(id: mealId)
            Haptics.success()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func toggleActive(_ mealId: String, api: RationAPI) async {
        do {
            _ = try await api.toggleMealActive(id: mealId)
            Haptics.light()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func deleteMeal(_ mealId: String, api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        do {
            try await api.deleteMeal(mealId)
            Haptics.light()
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
