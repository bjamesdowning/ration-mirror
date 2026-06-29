import Foundation
import Observation

@MainActor
@Observable
final class CargoViewModel {
    private(set) var items: [CargoItem] = []
    private(set) var total = 0
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    var errorMessage: String?
    var domainFilter: CargoDomain?
    var searchQuery = ""
    var staleLabel: String?

    private var nextCursor: String?

    func reload(api: RationAPI, snapshots: SnapshotStore, online: Bool) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if !searchQuery.trimmingCharacters(in: .whitespaces).isEmpty, online {
            await search(api: api)
            return
        }

        if online {
            do {
                let page = try await api.cargo(cursor: nil, domain: domainFilter)
                items = page.items
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
            items = response.results.map { result in
                CargoItem(
                    id: result.id,
                    organizationId: "",
                    name: result.name,
                    quantity: result.quantity,
                    unit: result.unit,
                    tags: [],
                    domain: result.domain,
                    status: "stable",
                    expiresAt: nil,
                    createdAt: Date(),
                    updatedAt: Date()
                )
            }
            total = items.count
            nextCursor = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func restoreSnapshot(_ snapshots: SnapshotStore) {
        if let cached = snapshots.load(CargoPage.self, domain: SnapshotDomain.cargo) {
            items = cached.payload.items
            total = cached.payload.total
            nextCursor = cached.payload.nextCursor
        }
    }

    func loadMoreIfNeeded(current item: CargoItem, api: RationAPI) async {
        guard searchQuery.isEmpty else { return }
        guard let cursor = nextCursor, !isLoadingMore else { return }
        guard items.suffix(5).contains(where: { $0.id == item.id }) else { return }

        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await api.cargo(cursor: cursor, domain: domainFilter)
            items.append(contentsOf: page.items)
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
        let snapshot = items
        items.removeAll { $0.id == item.id }
        total = max(0, total - 1)
        do {
            try await api.deleteCargo(item.id)
            Haptics.light()
        } catch {
            items = snapshot
            total = snapshot.count
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

/// Memberwise initializer for search result mapping (CargoItem only decodes from JSON).
extension CargoItem {
    init(
        id: String,
        organizationId: String,
        name: String,
        quantity: Double,
        unit: String,
        tags: [String],
        domain: String,
        status: String,
        expiresAt: Date?,
        createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.organizationId = organizationId
        self.name = name
        self.quantity = quantity
        self.unit = unit
        self.tags = tags
        self.domain = domain
        self.status = status
        self.expiresAt = expiresAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
