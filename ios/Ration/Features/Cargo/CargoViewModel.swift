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
    private(set) var isLoadingMore = false
    private(set) var isClearingSelections = false
    var errorMessage: String?
    var availableTags: [String] = []

    var filters = PageFilterState(configuration: PageFilterConfiguration(
        supportsDomain: true,
        supportsTags: true,
        supportsSearch: true
    ))

    var selectedCargoCount: Int { activeCargoIds.count }

    var isSearchActive: Bool {
        !filters.search.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private var nextCursor: String?
    private var rawItems: [CargoItem] = []

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

    func reload(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if isSearchActive, online {
            await search(api: api)
            return
        }

        if online {
            do {
                async let pageTask = api.cargo(cursor: nil, domain: filters.domain)
                async let tagsTask = api.cargoTags()
                let page = try await pageTask
                availableTags = (try? await tagsTask.tags) ?? availableTags
                rawItems = page.items
                activeCargoIds = Set(page.activeCargoIds ?? [])
                listContent = .inventory(displayedInventory)
                total = page.total
                nextCursor = page.nextCursor
                snapshots.save(page, domain: SnapshotDomain.cargo, organizationId: organizationId)
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                restoreSnapshot(snapshots, organizationId: organizationId)
            }
        } else {
            restoreSnapshot(snapshots, organizationId: organizationId)
        }
    }

    func applyClientFilters() {
        if case .inventory = listContent {
            listContent = .inventory(displayedInventory)
        }
    }

    private func search(api: RationAPI) async {
        do {
            let response = try await api.search(query: filters.search)
            listContent = .search(response.results)
            total = response.results.count
            nextCursor = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func restoreSnapshot(_ snapshots: SnapshotStore, organizationId: String) {
        if let cached = snapshots.load(CargoPage.self, domain: SnapshotDomain.cargo, organizationId: organizationId) {
            rawItems = cached.payload.items
            activeCargoIds = Set(cached.payload.activeCargoIds ?? [])
            listContent = .inventory(displayedInventory)
            total = cached.payload.total
            nextCursor = cached.payload.nextCursor
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

        rawItems.removeAll { $0.id == id }
        activeCargoIds.remove(id)

        switch listContent {
        case .inventory:
            listContent = .inventory(displayedInventory)
            total = max(0, total - 1)
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
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
