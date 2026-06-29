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
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    var errorMessage: String?
    var staleLabel: String?
    var availableTags: [String] = []

    var filters = PageFilterState(configuration: PageFilterConfiguration(
        supportsDomain: true,
        supportsTags: true,
        supportsSearch: true
    ))

    var isSearchActive: Bool {
        !filters.search.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private var nextCursor: String?
    private var rawItems: [CargoItem] = []

    var displayedInventory: [CargoItem] {
        PageFilterEngine.filterCargo(rawItems, domain: filters.domain, tag: filters.tag, search: filters.search)
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
        staleLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.cargo, organizationId: organizationId)
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
            listContent = .inventory(displayedInventory)
            nextCursor = page.nextCursor
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func delete(_ item: CargoItem, api: RationAPI) async {
        guard case var .inventory(items) = listContent else { return }
        let snapshot = items
        rawItems.removeAll { $0.id == item.id }
        items = displayedInventory
        listContent = .inventory(items)
        total = max(0, total - 1)
        do {
            try await api.deleteCargo(item.id)
            Haptics.light()
        } catch {
            rawItems = snapshot
            listContent = .inventory(snapshot)
            total = snapshot.count
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
