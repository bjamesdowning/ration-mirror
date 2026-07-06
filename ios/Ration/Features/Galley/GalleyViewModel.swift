import Foundation
import Observation

@MainActor
@Observable
final class GalleyViewModel {
    /// Must stay within `MealMatchQuerySchema.limit` max (100) on the server.
    private static let matchFetchLimit = 100

    enum CookOutcome: Sendable {
        case success(
            undoToken: String?,
            servings: Int,
            ingredientsDeducted: Int,
            partialCook: Bool,
            skippedIngredients: [MissingIngredientDetail]
        )
        case needsConfirmation(missing: [MissingIngredientDetail])
        case failed
    }

    static func cookSuccessMessage(
        servings: Int,
        ingredientsDeducted: Int,
        partialCook: Bool,
        skippedIngredients: [MissingIngredientDetail]
    ) -> String {
        if partialCook, !skippedIngredients.isEmpty {
            let names = skippedIngredients.map { $0.name.capitalized }.joined(separator: ", ")
            if ingredientsDeducted > 0 {
                return "Cooked \(servings) servings. Deducted available cargo; skipped: \(names)."
            }
            return "Cooked \(servings) servings. Insufficient stock for: \(names)."
        }
        return "Cooked \(servings) servings · \(ingredientsDeducted) deductions"
    }

    private(set) var meals: [Meal] = []
    private(set) var matches: [MealMatch] = []
    private(set) var matchByMealId: [String: MealMatch] = [:]
    private(set) var mealTotal = 0
    private(set) var matchTotal = 0
    private(set) var activeMealIds: Set<String> = []
    private(set) var isLoading = false
    private(set) var isClearingSelections = false
    var errorMessage: String?

    var isMatchMode: Bool { filters.matchingEnabled }

    var filters = PageFilterState(configuration: PageFilterConfiguration(
        supportsDomain: true,
        supportsTags: true,
        supportsSearch: true,
        supportsMatching: true
    ))

    var selectedMealCount: Int { activeMealIds.count }

    var displayedMeals: [Meal] {
        PageFilterEngine.filterMeals(meals, domain: filters.domain, tags: filters.selectedTags, search: filters.search)
    }

    var displayedMatches: [MealMatch] {
        let filtered = PageFilterEngine.filterMeals(
            matches.map(\.meal),
            domain: filters.domain,
            tags: filters.selectedTags,
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

    func isMealSelected(_ mealId: String) -> Bool {
        activeMealIds.contains(mealId)
    }

    func match(for mealId: String) -> MealMatch? {
        matchByMealId[mealId]
    }

    private var serverTagFilter: String? {
        filters.selectedTags.count == 1 ? filters.selectedTags.first : nil
    }

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if online {
            if isMatchMode {
                do {
                    async let matchTask = api.matchMeals(limit: Self.matchFetchLimit, minMatch: 0)
                    async let mealsTask = api.meals(tag: serverTagFilter, domain: filters.domain)
                    let response = try await matchTask
                    let mealsResponse = try await mealsTask
                    matches = response.matches
                    matchTotal = response.total ?? response.matches.count
                    matchByMealId = GalleyMatchMapBuilder.build(from: response.matches)
                    activeMealIds = Set(mealsResponse.activeMealIds ?? [])
                } catch {
                    errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                    restoreSnapshot(snapshots, organizationId: organizationId)
                }
            } else {
                do {
                    let mealsResponse = try await api.meals(tag: serverTagFilter, domain: filters.domain)
                    meals = mealsResponse.meals
                    mealTotal = mealsResponse.total ?? mealsResponse.meals.count
                    activeMealIds = Set(mealsResponse.activeMealIds ?? [])
                    snapshots.save(mealsResponse, domain: SnapshotDomain.galley, organizationId: organizationId)
                } catch {
                    errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                    restoreSnapshot(snapshots, organizationId: organizationId)
                }
                await refreshAvailabilityMatches(api: api, online: true)
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
            let response = try await api.matchMeals(limit: Self.matchFetchLimit, minMatch: 0)
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
            activeMealIds = Set(cached.payload.activeMealIds ?? [])
        }
    }

    func cook(
        _ mealId: String,
        servings: Int? = nil,
        confirmInsufficient: Bool = false,
        api: RationAPI
    ) async -> CookOutcome {
        do {
            let result = try await api.cookMeal(
                id: mealId,
                servings: servings,
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
            return .success(
                undoToken: result.undoToken,
                servings: result.servings ?? servings ?? 1,
                ingredientsDeducted: result.ingredientsDeducted ?? 0,
                partialCook: result.partialCook ?? false,
                skippedIngredients: result.skippedIngredients ?? []
            )
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return .failed
        }
    }

    func toggleActive(_ mealId: String, api: RationAPI) async {
        let activating = !activeMealIds.contains(mealId)
        if activating {
            activeMealIds.insert(mealId)
        } else {
            activeMealIds.remove(mealId)
        }
        do {
            let response = try await api.toggleMealActive(id: mealId)
            if response.isActive {
                activeMealIds.insert(mealId)
            } else {
                activeMealIds.remove(mealId)
            }
            Haptics.light()
        } catch {
            if activating {
                activeMealIds.remove(mealId)
            } else {
                activeMealIds.insert(mealId)
            }
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func clearSelections(api: RationAPI) async {
        guard !activeMealIds.isEmpty else { return }
        isClearingSelections = true
        defer { isClearingSelections = false }
        let previous = activeMealIds
        activeMealIds = []
        do {
            _ = try await api.clearMealSelections()
            Haptics.light()
        } catch {
            activeMealIds = previous
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func deleteMeal(_ mealId: String, api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        do {
            try await api.deleteMeal(mealId)
            activeMealIds.remove(mealId)
            Haptics.light()
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
