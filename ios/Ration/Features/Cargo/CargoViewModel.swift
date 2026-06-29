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

    private var nextCursor: String?

    func reload(api: RationAPI) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let page = try await api.cargo(cursor: nil, domain: domainFilter)
            items = page.items
            total = page.total
            nextCursor = page.nextCursor
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func loadMoreIfNeeded(current item: CargoItem, api: RationAPI) async {
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

    func setFilter(_ domain: CargoDomain?, api: RationAPI) async {
        domainFilter = domain
        await reload(api: api)
    }

    func delete(_ item: CargoItem, api: RationAPI) async {
        let snapshot = items
        items.removeAll { $0.id == item.id }
        total = max(0, total - 1)
        do {
            try await api.deleteCargo(item.id)
        } catch {
            items = snapshot
            total = snapshot.count
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
