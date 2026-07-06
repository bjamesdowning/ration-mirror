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
    var isEditMode = false
    var toggleErrorMessage: String?

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
        let unchecked = data.latestSupplyList?.resolvedUncheckedCount ?? 0
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

    func saveProfile(_ profile: HubProfile, api: RationAPI) async throws {
        guard profile != "custom" else { return }
        _ = try await api.patchSettings(SettingsPatch(hubProfile: profile))
    }

    func toggleSupplyItem(
        _ item: SupplyItem,
        isPurchased: Bool,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async {
        guard case let .loaded(data) = state else { return }
        guard let supplyList = data.latestSupplyList else { return }

        toggleErrorMessage = nil

        let updatedList = supplyList.withItemPurchaseState(item.id, isPurchased: isPurchased)
        let newData = data.withSupplyList(updatedList)
        state = .loaded(newData)
        if isPurchased { Haptics.light() }

        guard online else {
            toggleErrorMessage = "Checked off offline — will sync when you're back online."
            return
        }

        do {
            _ = try await api.toggleSupplyItem(item.id, isPurchased: isPurchased)
            snapshots.save(newData, domain: SnapshotDomain.hub, organizationId: organizationId)
        } catch {
            toggleErrorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        }
    }
}

private extension HubResponse {
    func withSupplyList(_ list: SupplyList) -> HubResponse {
        HubResponse(
            expiringItems: expiringItems,
            cargoStats: cargoStats,
            latestSupplyList: list,
            manifestPreview: manifestPreview,
            expirationAlertDays: expirationAlertDays,
            hubProfile: hubProfile,
            hubLayout: hubLayout,
            availableMealTags: availableMealTags,
            availableCargoTags: availableCargoTags,
            cargoTagIndex: cargoTagIndex,
            mealMatches: mealMatches,
            partialMealMatches: partialMealMatches,
            snackMatches: snackMatches
        )
    }
}
