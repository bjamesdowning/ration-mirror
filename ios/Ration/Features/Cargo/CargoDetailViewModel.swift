import Foundation
import Observation

@MainActor
@Observable
final class CargoDetailViewModel {
    private(set) var item: CargoItem?
    private(set) var connectedMeals: [ConnectedCargoMeal] = []
    private(set) var isLoading = false
    private(set) var isSelectedForRestock = false
    private(set) var isTogglingRestock = false
    private(set) var isMarkingEmpty = false
    var errorMessage: String?

    func load(id: String, api: RationAPI) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let detailTask = api.cargoItem(id: id)
            async let activeTask = api.cargo(cursor: nil, limit: 1)
            let response = try await detailTask
            let activePage = try await activeTask
            item = response.item
            connectedMeals = response.connectedMeals ?? []
            isSelectedForRestock = activePage.activeCargoIds?.contains(id) ?? false
        } catch {
            item = nil
            connectedMeals = []
            isSelectedForRestock = false
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func toggleRestock(quantity: Double? = nil, api: RationAPI) async {
        guard let item else { return }
        let activating = !isSelectedForRestock
        isTogglingRestock = true
        if activating {
            isSelectedForRestock = true
        } else {
            isSelectedForRestock = false
        }
        defer { isTogglingRestock = false }
        do {
            let response = try await api.toggleCargoRestock(id: item.id, quantity: quantity)
            isSelectedForRestock = response.isActive
            Haptics.light()
        } catch {
            isSelectedForRestock = !activating
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func delete(api: RationAPI) async -> Bool {
        guard let item else { return false }
        do {
            try await api.deleteCargo(item.id)
            Haptics.light()
            return true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }

    func markEmpty(api: RationAPI) async {
        guard let item, item.quantity > 0, !isMarkingEmpty else { return }
        let previous = item
        isMarkingEmpty = true
        self.item = item.withZeroQuantity()
        defer { isMarkingEmpty = false }
        do {
            let response = try await api.updateCargo(id: item.id, UpdateCargoRequest(quantity: 0))
            self.item = response.item
            Haptics.light()
        } catch {
            self.item = previous
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
