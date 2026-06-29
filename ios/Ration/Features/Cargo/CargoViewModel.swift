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
    var domainFilter: CargoDomain?
    var searchQuery = ""
    var staleLabel: String?

    var isSearchActive: Bool {
        !searchQuery.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private var nextCursor: String?

    func reload(api: RationAPI, snapshots: SnapshotStore, online: Bool) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if isSearchActive, online {
            await search(api: api)
            return
        }

        if online {
            do {
                let page = try await api.cargo(cursor: nil, domain: domainFilter)
                listContent = .inventory(page.items)
                total = page.total
                nextCursor = page.nextCursor
                snapshots.save(page, domain: SnapshotDomain.cargo, organizationId: nil)
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                restoreSnapshot(snapshots)
            }
        } else {
            restoreSnapshot(snapshots)
        }
        staleLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.cargo)
    }

    private func search(api: RationAPI) async {
        do {
            let response = try await api.search(query: searchQuery)
            listContent = .search(response.results)
            total = response.results.count
            nextCursor = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func restoreSnapshot(_ snapshots: SnapshotStore) {
        if let cached = snapshots.load(CargoPage.self, domain: SnapshotDomain.cargo) {
            listContent = .inventory(cached.payload.items)
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
            let page = try await api.cargo(cursor: cursor, domain: domainFilter)
            listContent = .inventory(items + page.items)
            nextCursor = page.nextCursor
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func setFilter(_ domain: CargoDomain?, api: RationAPI, snapshots: SnapshotStore, online: Bool) async {
        domainFilter = domain
        await reload(api: api, snapshots: snapshots, online: online)
    }

    func delete(_ item: CargoItem, api: RationAPI) async {
        guard case var .inventory(items) = listContent else { return }
        let snapshot = items
        items.removeAll { $0.id == item.id }
        listContent = .inventory(items)
        total = max(0, total - 1)
        do {
            try await api.deleteCargo(item.id)
            Haptics.light()
        } catch {
            listContent = .inventory(snapshot)
            total = snapshot.count
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
