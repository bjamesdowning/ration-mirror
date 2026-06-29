import Foundation
import Observation

@MainActor
@Observable
final class HubViewModel {
    enum State {
        case loading
        case loaded(HubResponse)
        case failed(String)
    }

    private(set) var state: State = .loading
    var staleLabel: String?
    var isEditMode = false

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        if online {
            do {
                let data = try await api.hub()
                state = .loaded(data)
                snapshots.save(data, domain: SnapshotDomain.hub, organizationId: organizationId)
            } catch {
                if !restoreSnapshot(snapshots, organizationId: organizationId) {
                    state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                }
            }
        } else if restoreSnapshot(snapshots, organizationId: organizationId) {
            // offline snapshot
        } else {
            state = .failed("You're offline and no cached Hub data is available.")
        }
        staleLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.hub, organizationId: organizationId)
    }

    @discardableResult
    private func restoreSnapshot(_ snapshots: SnapshotStore, organizationId: String) -> Bool {
        guard let cached = snapshots.load(HubResponse.self, domain: SnapshotDomain.hub, organizationId: organizationId) else {
            return false
        }
        state = .loaded(cached.payload)
        return true
    }

    var resolvedLayout: [HubWidgetLayout] {
        guard case let .loaded(data) = state else { return [] }
        return HubLayoutEngine.resolveLayout(profile: data.hubProfile, layout: data.hubLayout)
    }

    func nextAction(for data: HubResponse) -> (key: String, title: String, detail: String, icon: String)? {
        if data.cargoStats.expiringCount > 0 {
            return ("expiring", "Use expiring cargo", "\(data.cargoStats.expiringCount) items expiring soon", "clock.badge.exclamationmark")
        }
        let unchecked = data.latestSupplyList?.items.filter { !$0.isPurchased }.count ?? 0
        if unchecked > 0 {
            return ("supply", "Finish supply run", "\(unchecked) items to buy", "cart")
        }
        if data.cargoStats.expiredCount > 0 {
            return ("expired", "Clear expired cargo", "\(data.cargoStats.expiredCount) expired items", "xmark.bin")
        }
        let readyMeals = data.mealMatches.filter(\.canMake).count
        if readyMeals == 0, data.mealMatches.isEmpty {
            return ("galley", "Stock Galley", "Add your first meal", "fork.knife")
        }
        return ("scan", "Scan receipt", "Add cargo from a receipt", "camera.viewfinder")
    }

    func saveLayout(_ widgets: [HubWidgetLayout], api: RationAPI) async throws {
        _ = try await api.patchSettings(SettingsPatch(
            hubProfile: "custom",
            hubLayout: HubLayoutPayload(widgets: widgets)
        ))
    }

    func toggleSupplyItem(
        _ item: SupplyItem,
        isPurchased: Bool,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async {
        guard case var .loaded(data) = state else { return }
        guard var supplyList = data.latestSupplyList else { return }

        let updatedItems = supplyList.items.map { existing in
            existing.id == item.id
                ? SupplyItem(id: existing.id, name: existing.name, quantity: existing.quantity, unit: existing.unit, domain: existing.domain, isPurchased: isPurchased)
                : existing
        }
        supplyList = SupplyList(id: supplyList.id, name: supplyList.name, items: updatedItems)
        data = HubResponse(
            expiringItems: data.expiringItems,
            cargoStats: data.cargoStats,
            latestSupplyList: supplyList,
            manifestPreview: data.manifestPreview,
            expirationAlertDays: data.expirationAlertDays,
            hubProfile: data.hubProfile,
            hubLayout: data.hubLayout,
            availableMealTags: data.availableMealTags,
            mealMatches: data.mealMatches,
            partialMealMatches: data.partialMealMatches,
            snackMatches: data.snackMatches
        )
        state = .loaded(data)
        snapshots.save(data, domain: SnapshotDomain.hub, organizationId: organizationId)
        if isPurchased { Haptics.light() }

        guard online else { return }
        do {
            _ = try await api.toggleSupplyItem(item.id, isPurchased: isPurchased)
        } catch {
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        }
    }
}
