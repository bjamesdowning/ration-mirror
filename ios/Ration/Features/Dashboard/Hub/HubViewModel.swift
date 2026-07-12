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
    private(set) var isRefreshing = false
    private(set) var refreshErrorMessage: String?
    var isEditMode = false
    var toggleErrorMessage: String?
    var refreshOutcomes: SnapshotRefreshOutcomeStore?
    private var layoutSaveGeneration = 0

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        refreshErrorMessage = nil
        let hadCache = await SnapshotRefreshPolicy.restoreIfAvailable(
            snapshots: snapshots,
            type: HubResponse.self,
            domain: SnapshotDomain.hub,
            organizationId: organizationId
        ) { data in
            state = .loaded(data)
        }

        if !hadCache {
            state = .loading
        }

        guard online else {
            if !hadCache {
                state = .failed("You're offline and no cached Hub data is available.")
            }
            return
        }

        isRefreshing = hadCache
        defer { isRefreshing = false }

        do {
            let data = try await api.hub()
            state = .loaded(data)
            await snapshots.save(data, domain: SnapshotDomain.hub, organizationId: organizationId)
            if let refreshOutcomes {
                SnapshotRefreshPolicy.recordRefreshSuccess(
                    outcomes: refreshOutcomes,
                    organizationId: organizationId,
                    domain: SnapshotDomain.hub
                )
            }
        } catch {
            if SnapshotRefreshPolicy.isIgnorableRefreshError(error) { return }
            if let refreshOutcomes {
                SnapshotRefreshPolicy.recordRefreshFailure(
                    outcomes: refreshOutcomes,
                    organizationId: organizationId,
                    domain: SnapshotDomain.hub,
                    error: error
                )
            }
            if !hadCache {
                state = .failed(SnapshotRefreshPolicy.userFacingRefreshDetail(error))
            } else {
                refreshErrorMessage = SnapshotRefreshPolicy.refreshFailureMessage(feature: "Hub", error: error)
            }
        }
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
        return ("scan", "Scan items", "Add cargo from a photo", "camera.viewfinder")
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

    func applyVisibleOrder(
        _ visibleOrder: [HubWidgetLayout],
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async {
        guard case let .loaded(data) = state else { return }
        let previousData = data

        var widgets = HubLayoutEngine.initEditableWidgets(
            profile: data.hubProfile,
            layout: data.hubLayout
        )
        widgets = HubLayoutEngine.applyVisibleOrder(visibleOrder, to: widgets)

        let optimistic = previousData.withHubLayout(
            HubLayoutPayload(widgets: widgets),
            profile: "custom"
        )
        state = .loaded(optimistic)
        refreshErrorMessage = nil

        layoutSaveGeneration += 1
        let saveGeneration = layoutSaveGeneration

        guard online else {
            await snapshots.save(optimistic, domain: SnapshotDomain.hub, organizationId: organizationId)
            refreshErrorMessage = "Layout changed offline — will sync when you're back online."
            return
        }

        do {
            try await saveLayout(widgets, api: api)
            guard saveGeneration == layoutSaveGeneration else { return }
            await snapshots.save(optimistic, domain: SnapshotDomain.hub, organizationId: organizationId)
        } catch {
            guard saveGeneration == layoutSaveGeneration else { return }
            state = .loaded(previousData)
            refreshErrorMessage = SnapshotRefreshPolicy.refreshFailureMessage(
                feature: "Hub layout",
                error: error
            )
        }
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
            await snapshots.save(newData, domain: SnapshotDomain.hub, organizationId: organizationId)
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

    func withHubLayout(_ layout: HubLayoutPayload, profile: HubProfile) -> HubResponse {
        HubResponse(
            expiringItems: expiringItems,
            cargoStats: cargoStats,
            latestSupplyList: latestSupplyList,
            manifestPreview: manifestPreview,
            expirationAlertDays: expirationAlertDays,
            hubProfile: profile,
            hubLayout: layout,
            availableMealTags: availableMealTags,
            availableCargoTags: availableCargoTags,
            cargoTagIndex: cargoTagIndex,
            mealMatches: mealMatches,
            partialMealMatches: partialMealMatches,
            snackMatches: snackMatches
        )
    }
}
