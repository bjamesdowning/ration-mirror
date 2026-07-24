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
    private(set) var isRefreshing = false
    private(set) var isClearingSelections = false
    private(set) var isSearching = false
    var errorMessage: String?
    var refreshOutcomes: SnapshotRefreshOutcomeStore?

    var isMatchMode: Bool { filters.matchingEnabled }

    var filters = PageFilterState(configuration: PageFilterConfiguration(
        supportsDomain: true,
        supportsTags: true,
        supportsSearch: true,
        supportsMatching: true
    ))

    private(set) var displayedMeals: [Meal] = []
    private(set) var displayedMatches: [MealMatch] = []

    var selectedMealCount: Int { activeMealIds.count }

    var isSearchActive: Bool {
        !filters.search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var isRemoteSearchActive: Bool {
        filters.search.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
    }

    private var searchTask: Task<Void, Never>?
    private var mutationTask: Task<Void, Never>?
    private var cookTask: Task<CookOutcome, Never>?
    private var availabilityTask: Task<Void, Never>?
    private static let searchDebounceNanoseconds: UInt64 = 300_000_000
    private static let availabilityDebounceNanoseconds: UInt64 = 1_000_000_000

    func cancelLoads() {
        searchTask?.cancel()
        availabilityTask?.cancel()
        searchTask = nil
        availabilityTask = nil
    }

    func cancelAll() {
        cancelLoads()
        mutationTask?.cancel()
        cookTask?.cancel()
        mutationTask = nil
        cookTask = nil
    }

    func scheduleAvailabilityRefresh(api: RationAPI, online: Bool) {
        availabilityTask?.cancel()
        availabilityTask = Task {
            try? await Task.sleep(nanoseconds: Self.availabilityDebounceNanoseconds)
            guard !Task.isCancelled else { return }
            await refreshAvailabilityMatches(api: api, online: online)
        }
    }

    func runMutation(_ work: @escaping @MainActor () async -> Void) {
        mutationTask?.cancel()
        cookTask?.cancel()
        mutationTask = Task {
            await work()
        }
    }

    func runCook(
        _ mealId: String,
        servings: Int? = nil,
        confirmInsufficient: Bool = false,
        api: RationAPI
    ) async -> CookOutcome {
        mutationTask?.cancel()
        cookTask?.cancel()
        let task = Task { @MainActor in
            await cook(
                mealId,
                servings: servings,
                confirmInsufficient: confirmInsufficient,
                api: api
            )
        }
        cookTask = task
        return await task.value
    }

    var listHeaderCount: Int {
        if isMatchMode {
            return isRemoteSearchActive ? displayedMatches.count : matchTotal
        }
        return isRemoteSearchActive ? displayedMeals.count : mealTotal
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

    private var serverSearchQuery: String? {
        isRemoteSearchActive
            ? filters.search.trimmingCharacters(in: .whitespacesAndNewlines)
            : nil
    }

    private var clientSearchText: String {
        isRemoteSearchActive ? "" : filters.search
    }

    func refreshDisplayedContent() {
        displayedMeals = PageFilterEngine.filterMeals(
            meals,
            domain: filters.domain,
            tags: filters.selectedTags,
            search: clientSearchText
        )
        let filteredMeals = PageFilterEngine.filterMeals(
            matches.map(\.meal),
            domain: filters.domain,
            tags: filters.selectedTags,
            search: clientSearchText
        )
        let ids = Set(filteredMeals.map(\.id))
        displayedMatches = matches.filter { ids.contains($0.meal.id) }
    }

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        errorMessage = nil
        let hadCache = await restoreSnapshot(snapshots, organizationId: organizationId)
        let hasUsableContent = SnapshotRefreshPolicy.hasUsableContent(
            hasSnapshot: hadCache,
            modeSpecificItemCount: isMatchMode ? matches.count : nil
        )
        isLoading = !hasUsableContent
        defer { isLoading = false }

        guard online else {
            matchByMealId = [:]
            if !hasUsableContent {
                errorMessage = isMatchMode
                    ? "You're offline and no cached meal matches are available."
                    : "You're offline and no cached meals are available."
            }
            refreshDisplayedContent()
            return
        }

        isRefreshing = hasUsableContent
        defer { isRefreshing = false }

        if isMatchMode {
            do {
                let searchQuery = serverSearchQuery
                async let matchTask = api.matchMeals(
                    limit: Self.matchFetchLimit,
                    minMatch: 0,
                    tag: serverTagFilter,
                    domain: filters.domain,
                    q: searchQuery
                )
                async let mealsTask = api.meals(tag: serverTagFilter, domain: filters.domain)
                let response = try await matchTask
                let mealsResponse = try await mealsTask
                matches = response.matches
                matchTotal = searchQuery != nil
                    ? response.matches.count
                    : (response.total ?? response.matches.count)
                matchByMealId = GalleyMatchMapBuilder.build(from: response.matches)
                activeMealIds = Set(mealsResponse.activeMealIds ?? [])
                if let refreshOutcomes {
                    SnapshotRefreshPolicy.recordRefreshSuccess(
                        outcomes: refreshOutcomes,
                        organizationId: organizationId,
                        domain: SnapshotDomain.galley
                    )
                }
            } catch {
                if SnapshotRefreshPolicy.isIgnorableRefreshError(error) { return }
                if let refreshOutcomes {
                    SnapshotRefreshPolicy.recordRefreshFailure(
                        outcomes: refreshOutcomes,
                        organizationId: organizationId,
                        domain: SnapshotDomain.galley,
                        error: error
                    )
                }
                let detail = SnapshotRefreshPolicy.userFacingRefreshDetail(error)
                errorMessage = hasUsableContent
                    ? SnapshotRefreshPolicy.refreshFailureMessage(
                        feature: "meal matches",
                        cachedContent: "previous results",
                        detail: detail
                    )
                    : detail
            }
        } else {
            do {
                let searchQuery = serverSearchQuery
                let mealsResponse = try await api.meals(
                    tag: serverTagFilter,
                    domain: filters.domain,
                    q: searchQuery
                )
                meals = mealsResponse.meals
                mealTotal = searchQuery != nil
                    ? mealsResponse.meals.count
                    : (mealsResponse.total ?? mealsResponse.meals.count)
                activeMealIds = Set(mealsResponse.activeMealIds ?? [])
                await snapshots.save(mealsResponse, domain: SnapshotDomain.galley, organizationId: organizationId)
                if let refreshOutcomes {
                    SnapshotRefreshPolicy.recordRefreshSuccess(
                        outcomes: refreshOutcomes,
                        organizationId: organizationId,
                        domain: SnapshotDomain.galley
                    )
                }
            } catch {
                if SnapshotRefreshPolicy.isIgnorableRefreshError(error) { return }
                if let refreshOutcomes {
                    SnapshotRefreshPolicy.recordRefreshFailure(
                        outcomes: refreshOutcomes,
                        organizationId: organizationId,
                        domain: SnapshotDomain.galley,
                        error: error
                    )
                }
                let detail = SnapshotRefreshPolicy.userFacingRefreshDetail(error)
                errorMessage = hadCache
                    ? SnapshotRefreshPolicy.refreshFailureMessage(
                        feature: "Galley",
                        cachedContent: "cached meals",
                        detail: detail
                    )
                    : detail
            }
            await refreshAvailabilityMatches(api: api, online: true)
        }
        refreshDisplayedContent()
    }

    func handleSearchChange(
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) {
        searchTask?.cancel()
        let query = filters.search.trimmingCharacters(in: .whitespacesAndNewlines)
        if query.isEmpty {
            searchTask = Task {
                await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
            }
            return
        }
        if query.count < 2 {
            refreshDisplayedContent()
            return
        }
        guard online else {
            refreshDisplayedContent()
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: Self.searchDebounceNanoseconds)
            guard !Task.isCancelled else { return }
            isSearching = true
            defer { isSearching = false }
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        }
    }

    func refreshAvailabilityMatches(api: RationAPI, online: Bool) async {
        guard online else {
            matchByMealId = [:]
            refreshDisplayedContent()
            return
        }
        do {
            let response = try await api.matchMeals(
                limit: Self.matchFetchLimit,
                minMatch: 0,
                tag: serverTagFilter,
                domain: filters.domain
            )
            if isMatchMode {
                matches = response.matches
                matchTotal = response.total ?? response.matches.count
            }
            matchByMealId = GalleyMatchMapBuilder.build(from: response.matches)
        } catch {
            // Non-fatal — keep existing gauges until next full reload.
        }
        refreshDisplayedContent()
    }

    @discardableResult
    private func restoreSnapshot(_ snapshots: SnapshotStore, organizationId: String) async -> Bool {
        await SnapshotRefreshPolicy.restoreIfAvailable(
            snapshots: snapshots,
            type: MealsResponse.self,
            domain: SnapshotDomain.galley,
            organizationId: organizationId
        ) { response in
            meals = response.meals
            mealTotal = response.total ?? response.meals.count
            activeMealIds = Set(response.activeMealIds ?? [])
            refreshDisplayedContent()
        }
    }

    func cook(
        _ mealId: String,
        servings: Int? = nil,
        confirmInsufficient: Bool = false,
        api: RationAPI
    ) async -> CookOutcome {
        do {
            let result = try await MutationRetry.once {
                try await api.cookMeal(
                    id: mealId,
                    servings: servings,
                    confirmInsufficient: confirmInsufficient ? true : nil
                )
            }
            guard !Task.isCancelled else { return .failed }
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
        } catch is CancellationError {
            return .failed
        } catch {
            guard !Task.isCancelled else { return .failed }
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
            let response = try await MutationRetry.once {
                try await api.toggleMealActive(id: mealId)
            }
            guard !Task.isCancelled else { return }
            if response.isActive {
                activeMealIds.insert(mealId)
            } else {
                activeMealIds.remove(mealId)
            }
            Haptics.light()
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
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
            _ = try await MutationRetry.once {
                try await api.clearMealSelections()
            }
            guard !Task.isCancelled else {
                activeMealIds = previous
                return
            }
            Haptics.light()
        } catch is CancellationError {
            activeMealIds = previous
        } catch {
            guard !Task.isCancelled else {
                activeMealIds = previous
                return
            }
            activeMealIds = previous
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func deleteMeal(_ mealId: String, api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        do {
            try await MutationRetry.once {
                try await api.deleteMeal(mealId)
            }
            guard !Task.isCancelled else { return }
            activeMealIds.remove(mealId)
            Haptics.light()
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
