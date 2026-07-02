import Foundation
import Observation

@MainActor
@Observable
final class GalleyViewModel {
    private(set) var meals: [Meal] = []
    private(set) var matches: [MealMatch] = []
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

    /// Server org meal total in list mode; match result total in match mode.
    var listHeaderCount: Int {
        isMatchMode ? matchTotal : mealTotal
    }

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if online {
            do {
                if isMatchMode {
                    let response = try await api.matchMeals()
                    matches = response.matches
                    matchTotal = response.total ?? response.matches.count
                } else {
                    let response = try await api.meals(tag: filters.tag, domain: filters.domain)
                    meals = response.meals
                    mealTotal = response.total ?? response.meals.count
                    snapshots.save(response, domain: SnapshotDomain.galley, organizationId: organizationId)
                }
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                restoreSnapshot(snapshots, organizationId: organizationId)
            }
        } else {
            restoreSnapshot(snapshots, organizationId: organizationId)
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
