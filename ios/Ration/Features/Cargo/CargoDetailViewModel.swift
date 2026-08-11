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
    private(set) var isQuickEating = false
    private(set) var isPromoting = false
    private(set) var isPromoted = false
    var errorMessage: String?

    enum PromoteResult {
        case created
        case alreadyExisted
        case capacityExceeded
        case failed
    }

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
            isPromoted = (response.connectedMeals ?? []).contains { $0.type == "provision" }
        } catch {
            item = nil
            connectedMeals = []
            isSelectedForRestock = false
            isPromoted = false
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

    func quickEat(quantity: Double, api: RationAPI) async -> CargoQuickEatResponse? {
        guard let item, !isQuickEating else { return nil }
        isQuickEating = true
        defer { isQuickEating = false }
        do {
            let response = try await api.quickEatCargo(
                id: item.id,
                CargoQuickEatRequest(
                    quantity: quantity,
                    unit: item.unit,
                    date: CargoLocalDate.todayString(),
                    operationKey: UUID().uuidString
                )
            )
            let previous = item
            self.item = CargoItem(
                id: previous.id,
                organizationId: previous.organizationId,
                name: previous.name,
                quantity: response.cargo.quantity,
                unit: response.cargo.unit,
                baseQuantity: response.cargo.quantity,
                baseUnit: previous.baseUnit,
                tags: previous.tags,
                domain: previous.domain,
                status: previous.status,
                expiresAt: previous.expiresAt,
                createdAt: previous.createdAt,
                updatedAt: previous.updatedAt,
                nutrition: previous.nutrition
            )
            isPromoted = true
            Haptics.light()
            return response
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }

    func promoteToGalley(api: RationAPI) async -> PromoteResult {
        guard let item, !isPromoting, !isPromoted else {
            return isPromoted ? .alreadyExisted : .failed
        }
        isPromoting = true
        defer { isPromoting = false }
        do {
            let response = try await api.promoteCargoToProvision(id: item.id)
            isPromoted = true
            Haptics.light()
            return response.alreadyExisted ? .alreadyExisted : .created
        } catch let error as APIError {
            if case let .server(status, _, code, errorCode, _, _, _, _, _, _) = error,
               status == 403,
               code == "capacity_exceeded" || errorCode == "capacity_exceeded" {
                errorMessage = "Meal capacity reached. Upgrade to add more Galley items."
                return .capacityExceeded
            }
            errorMessage = error.errorDescription ?? "Couldn’t add to Galley"
            return .failed
        } catch {
            errorMessage = error.localizedDescription
            return .failed
        }
    }
}
