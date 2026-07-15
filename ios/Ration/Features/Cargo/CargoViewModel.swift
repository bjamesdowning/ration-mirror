import Foundation
import Observation

@MainActor
@Observable
final class CargoViewModel {
    enum ListContent {
        case inventory([CargoItem])
        case search([SearchResult])
    }

    private(set) var listContent: ListContent = .inventory([])
    private(set) var total = 0
    private(set) var activeCargoIds: Set<String> = []
    private(set) var isLoading = false
    private(set) var isRefreshing = false
    private(set) var isLoadingMore = false
    private(set) var isClearingSelections = false
    private(set) var isSearching = false
    var errorMessage: String?
    var availableTags: [String] = []
    var refreshOutcomes: SnapshotRefreshOutcomeStore?

    var filters = PageFilterState(configuration: PageFilterConfiguration(
        supportsDomain: true,
        supportsTags: true,
        supportsSearch: true
    ))

    var selectedCargoCount: Int { activeCargoIds.count }

    var isSearchActive: Bool {
        !filters.search.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var isRemoteSearchActive: Bool {
        filters.search.trimmingCharacters(in: .whitespaces).count >= Self.remoteSearchMinLength
    }

    private var nextCursor: String?
    private var inventoryNextCursor: String?
    private var inventoryTotal = 0
    private var rawItems: [CargoItem] = []
    private var searchTask: Task<Void, Never>?
    private static let searchDebounceNanoseconds: UInt64 = 300_000_000
    #if DEBUG
    static var searchDebounceNanosecondsForTesting: UInt64?
    #endif
    private static let remoteSearchMinLength = 2

    private static var effectiveSearchDebounceNanoseconds: UInt64 {
        #if DEBUG
        searchDebounceNanosecondsForTesting ?? searchDebounceNanoseconds
        #else
        searchDebounceNanoseconds
        #endif
    }

    var displayedInventory: [CargoItem] {
        PageFilterEngine.filterCargo(rawItems, domain: filters.domain, tags: filters.selectedTags, search: filters.search)
    }

    func isCargoSelected(_ cargoId: String) -> Bool {
        activeCargoIds.contains(cargoId)
    }

    func cachedCargoItem(id: String) -> CargoItem? {
        rawItems.first { $0.id == id }
    }

    func resolveCargoItem(for result: SearchResult, api: RationAPI) async -> CargoItem? {
        if let cached = cachedCargoItem(id: result.id) {
            return cached
        }
        do {
            return try await api.cargoItem(id: result.id).item
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }

    func reload(
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String,
        forceRemoteSearch: Bool = false
    ) async {
        errorMessage = nil

        if isSearchActive, online, forceRemoteSearch || isRemoteSearchActive {
            isLoading = listContentIsEmpty
            defer { isLoading = false }
            await search(api: api)
            return
        }

        if isSearchActive, !forceRemoteSearch, !isRemoteSearchActive {
            applyClientFilters()
            return
        }

        let hadCache = await restoreSnapshot(snapshots, organizationId: organizationId)
        isLoading = !hadCache
        defer { isLoading = false }

        guard online else {
            if !hadCache {
                errorMessage = "You're offline and no cached cargo is available."
            }
            return
        }

        isRefreshing = hadCache
        defer { isRefreshing = false }

        do {
            async let pageTask = api.cargo(cursor: nil, domain: filters.domain)
            async let tagsTask = api.cargoTags()
            let page = try await pageTask
            availableTags = (try? await tagsTask.tags) ?? availableTags
            rawItems = page.items
            activeCargoIds = Set(page.activeCargoIds ?? [])
            listContent = .inventory(displayedInventory)
            total = page.total
            inventoryTotal = page.total
            nextCursor = page.nextCursor
            inventoryNextCursor = page.nextCursor
            await snapshots.save(page, domain: SnapshotDomain.cargo, organizationId: organizationId)
            if let refreshOutcomes {
                SnapshotRefreshPolicy.recordRefreshSuccess(
                    outcomes: refreshOutcomes,
                    organizationId: organizationId,
                    domain: SnapshotDomain.cargo
                )
            }
        } catch {
            if SnapshotRefreshPolicy.isIgnorableRefreshError(error) { return }
            if let refreshOutcomes {
                SnapshotRefreshPolicy.recordRefreshFailure(
                    outcomes: refreshOutcomes,
                    organizationId: organizationId,
                    domain: SnapshotDomain.cargo,
                    error: error
                )
            }
            let detail = SnapshotRefreshPolicy.userFacingRefreshDetail(error)
            errorMessage = hadCache
                ? SnapshotRefreshPolicy.refreshFailureMessage(feature: "Cargo", detail: detail)
                : detail
        }
    }

    func applyClientFilters() {
        let items = displayedInventory
        listContent = .inventory(items)
        total = hasLocalFilters ? items.count : inventoryTotal
        nextCursor = inventoryNextCursor
    }

    func handleSearchChange(
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) {
        searchTask?.cancel()
        let query = filters.search.trimmingCharacters(in: .whitespaces)
        if query.isEmpty {
            searchTask = Task {
                await reload(
                    api: api,
                    snapshots: snapshots,
                    online: online,
                    organizationId: organizationId
                )
            }
            return
        }
        if query.count < Self.remoteSearchMinLength {
            applyClientFilters()
            return
        }
        guard online else {
            applyClientFilters()
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: Self.effectiveSearchDebounceNanoseconds)
            guard !Task.isCancelled else { return }
            await search(api: api)
        }
    }

    func cancelSearchTasks() {
        searchTask?.cancel()
        searchTask = nil
    }

    private func search(api: RationAPI) async {
        let query = filters.search.trimmingCharacters(in: .whitespaces)
        guard query.count >= Self.remoteSearchMinLength else { return }
        isSearching = true
        defer { isSearching = false }
        do {
            let response = try await api.search(query: query)
            guard query == filters.search.trimmingCharacters(in: .whitespaces) else { return }
            applyRemoteSearchResults(response.results)
        } catch {
            guard query == filters.search.trimmingCharacters(in: .whitespaces) else { return }
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func applyRemoteSearchResults(_ results: [SearchResult]) {
        var filtered = results
        if let domain = filters.domain {
            filtered = filtered.filter { $0.domain == domain.rawValue }
        }
        listContent = .search(filtered)
        total = filtered.count
        nextCursor = nil
    }

    @discardableResult
    private func restoreSnapshot(_ snapshots: SnapshotStore, organizationId: String) async -> Bool {
        await SnapshotRefreshPolicy.restoreIfAvailable(
            snapshots: snapshots,
            type: CargoPage.self,
            domain: SnapshotDomain.cargo,
            organizationId: organizationId
        ) { page in
            rawItems = page.items
            activeCargoIds = Set(page.activeCargoIds ?? [])
            listContent = .inventory(displayedInventory)
            total = page.total
            inventoryTotal = page.total
            nextCursor = page.nextCursor
            inventoryNextCursor = page.nextCursor
        }
    }

    private var listContentIsEmpty: Bool {
        switch listContent {
        case let .inventory(items): items.isEmpty
        case let .search(results): results.isEmpty
        }
    }

    func loadMoreIfNeeded(current item: CargoItem, api: RationAPI) async {
        guard !isSearchActive else { return }
        guard let cursor = nextCursor, !isLoadingMore else { return }
        guard case let .inventory(items) = listContent,
              items.suffix(5).contains(where: { $0.id == item.id })
        else { return }

        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await api.cargo(cursor: cursor, domain: filters.domain)
            rawItems.append(contentsOf: page.items)
            if let ids = page.activeCargoIds {
                activeCargoIds.formUnion(ids)
            }
            listContent = .inventory(displayedInventory)
            nextCursor = page.nextCursor
            inventoryNextCursor = page.nextCursor
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func toggleRestock(_ item: CargoItem, quantity: Double? = nil, api: RationAPI) async {
        let activating = !activeCargoIds.contains(item.id)
        if activating {
            activeCargoIds.insert(item.id)
        } else {
            activeCargoIds.remove(item.id)
        }
        do {
            let response = try await api.toggleCargoRestock(id: item.id, quantity: quantity)
            if response.isActive {
                activeCargoIds.insert(item.id)
            } else {
                activeCargoIds.remove(item.id)
            }
            Haptics.light()
        } catch {
            if activating {
                activeCargoIds.remove(item.id)
            } else {
                activeCargoIds.insert(item.id)
            }
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func clearSelections(api: RationAPI) async {
        guard !activeCargoIds.isEmpty else { return }
        isClearingSelections = true
        defer { isClearingSelections = false }
        let previous = activeCargoIds
        activeCargoIds = []
        do {
            _ = try await api.clearCargoSelections()
            Haptics.light()
        } catch {
            activeCargoIds = previous
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func delete(_ item: CargoItem, api: RationAPI) async {
        await delete(id: item.id, api: api)
    }

    func delete(id: String, api: RationAPI) async {
        let previousContent = listContent
        let previousRawItems = rawItems
        let previousTotal = total
        let previousInventoryTotal = inventoryTotal
        let removedFromInventory = rawItems.contains { $0.id == id }

        rawItems.removeAll { $0.id == id }
        if removedFromInventory {
            inventoryTotal = max(0, inventoryTotal - 1)
        }
        activeCargoIds.remove(id)

        switch listContent {
        case .inventory:
            applyClientFilters()
        case var .search(results):
            results.removeAll { $0.id == id }
            listContent = .search(results)
            total = results.count
        }

        do {
            try await api.deleteCargo(id)
            Haptics.light()
        } catch {
            rawItems = previousRawItems
            listContent = previousContent
            total = previousTotal
            inventoryTotal = previousInventoryTotal
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private var hasLocalFilters: Bool {
        isSearchActive || !filters.selectedTags.isEmpty || filters.domain != nil
    }
}
