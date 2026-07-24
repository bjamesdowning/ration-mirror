import Foundation
import UIKit
import Observation

@MainActor
@Observable
final class SupplyViewModel {
    private(set) var list: SupplyList?
    private(set) var isLoading = false
    private(set) var isRefreshing = false
    private(set) var isSyncing = false
    private(set) var isDocking = false
    private(set) var isScanning = false
    private(set) var scanStatusMessage: String?
    private(set) var snoozes: [SupplySnooze] = []
    private(set) var cargoLinkRows: [CargoLinkResolver.Row] = []
    var errorMessage: String?
    var dockMessage: String?
    var paywallContext: PaywallContext?
    var refreshOutcomes: SnapshotRefreshOutcomeStore?
    let share = ShareLinkController()
    private var lastHapticMilestone = 0
    private let maxPollAttempts = 80
    private let pollDelayNanoseconds: UInt64 = 1_500_000_000
    /// Bumped on cancel / new work so superseded scans cannot clear a newer spinner.
    private var workGeneration = 0
    private var mutationTask: Task<Void, Never>?

    func cancelActiveWork() {
        workGeneration += 1
        mutationTask?.cancel()
        mutationTask = nil
        share.cancel()
        isScanning = false
        scanStatusMessage = nil
    }

    func runMutation(_ work: @escaping @MainActor () async -> Void) {
        mutationTask?.cancel()
        mutationTask = Task {
            await work()
        }
    }

    #if DEBUG
    func setListForTesting(_ list: SupplyList) {
        self.list = list
    }
    #endif

    var filters = PageFilterState(configuration: PageFilterConfiguration(
        supportsDomain: true,
        supportsSearch: true,
        supportsSupplySort: true,
        supportsSupplyUnitMode: true
    ))

    var displayedItems: [SupplyItem] {
        guard let items = list?.items else { return [] }
        return PageFilterEngine.filterSupplyItems(
            items,
            domain: filters.domain,
            search: filters.search,
            sortMode: filters.supplySort,
            hidePurchased: filters.hidePurchased
        )
    }

    var purchasedCount: Int {
        list?.items.filter(\.isPurchased).count ?? 0
    }

    var totalCount: Int {
        list?.items.count ?? 0
    }

    var showsFilteredEmptyState: Bool {
        guard let list, !list.items.isEmpty else { return false }
        return displayedItems.isEmpty && filters.hasActiveFilters
    }

    var progressFraction: Double {
        guard totalCount > 0 else { return 0 }
        return Double(purchasedCount) / Double(totalCount)
    }

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        errorMessage = nil
        let hadCache = await restoreSnapshot(snapshots, organizationId: organizationId)
        isLoading = !hadCache
        defer { isLoading = false }

        guard online else {
            if !hadCache {
                errorMessage = "You're offline and no cached supply list is available."
            }
            await loadCargoLinks(api: api, snapshots: snapshots, organizationId: organizationId, online: online)
            return
        }

        isRefreshing = hadCache
        defer { isRefreshing = false }

        do {
            list = try await api.supply().list
            if let list {
                await snapshots.save(SupplyResponse(list: list), domain: SnapshotDomain.supply, organizationId: organizationId)
            }
            if let refreshOutcomes {
                SnapshotRefreshPolicy.recordRefreshSuccess(
                    outcomes: refreshOutcomes,
                    organizationId: organizationId,
                    domain: SnapshotDomain.supply
                )
            }
        } catch {
            if SnapshotRefreshPolicy.isIgnorableRefreshError(error) { return }
            if let refreshOutcomes {
                SnapshotRefreshPolicy.recordRefreshFailure(
                    outcomes: refreshOutcomes,
                    organizationId: organizationId,
                    domain: SnapshotDomain.supply,
                    error: error
                )
            }
            let detail = SnapshotRefreshPolicy.userFacingRefreshDetail(error)
            errorMessage = hadCache
                ? SnapshotRefreshPolicy.refreshFailureMessage(feature: "Supply", detail: detail)
                : detail
        }
        await loadCargoLinks(api: api, snapshots: snapshots, organizationId: organizationId, online: online)
        if online {
            await loadSnoozes(api: api)
        }
    }

    func loadCargoLinks(
        api: RationAPI,
        snapshots: SnapshotStore,
        organizationId: String,
        online: Bool
    ) async {
        if let cached = await snapshots.load(CargoPage.self, domain: SnapshotDomain.cargo, organizationId: organizationId) {
            cargoLinkRows = cached.payload.items.map { CargoLinkResolver.Row(id: $0.id, name: $0.name) }
        }
        guard online else { return }
        do {
            let response = try await api.cargoTagIndex()
            cargoLinkRows = response.index.map { CargoLinkResolver.Row(id: $0.id, name: $0.name) }
        } catch {
            // Non-fatal — names stay plain text when unresolved.
        }
    }

    func loadSnoozes(api: RationAPI) async {
        do {
            snoozes = try await api.supplySnoozes().snoozes
        } catch {
            // Non-fatal — snooze panel hides when empty.
        }
    }

    @discardableResult
    private func restoreSnapshot(_ snapshots: SnapshotStore, organizationId: String) async -> Bool {
        await SnapshotRefreshPolicy.restoreIfAvailable(
            snapshots: snapshots,
            type: SupplyResponse.self,
            domain: SnapshotDomain.supply,
            organizationId: organizationId
        ) { response in
            list = response.list
        }
    }

    func toggle(_ item: SupplyItem, api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        if item.isPurchased {
            guard let current = list else { return }
            let updatedItems = current.items.map { existing in
                existing.id == item.id ? existing.withPurchased(false) : existing
            }
            list = SupplyList(id: current.id, name: current.name, items: updatedItems)
            guard online else { return }
            do {
                _ = try await MutationRetry.once {
                    try await api.updateSupplyItem(item.id, quantity: nil, unit: nil, isPurchased: false)
                }
            } catch {
                guard !Task.isCancelled else { return }
                await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
            }
        } else {
            await markPurchased(item, quantity: item.quantity, unit: item.unit, api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        }
    }

    func markPurchased(
        _ item: SupplyItem,
        quantity: Double,
        unit: String,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async {
        guard let current = list else { return }
        let updatedItems = current.items.map { existing in
            existing.id == item.id
                ? SupplyItem(
                    id: existing.id,
                    name: existing.name,
                    quantity: quantity,
                    unit: unit,
                    domain: existing.domain,
                    isPurchased: true,
                    sourceOrigins: existing.sourceOrigins
                )
                : existing
        }
        list = SupplyList(id: current.id, name: current.name, items: updatedItems)
        Haptics.light()
        checkProgressHaptic()
        guard online else { return }
        do {
            _ = try await MutationRetry.once {
                try await api.updateSupplyItem(item.id, quantity: quantity, unit: unit, isPurchased: true)
            }
        } catch {
            guard !Task.isCancelled else { return }
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func checkProgressHaptic() {
        guard totalCount > 0 else { return }
        let pct = Int(progressFraction * 100)
        let milestone = [25, 50, 75, 100].last { pct >= $0 && lastHapticMilestone < $0 }
        if let milestone {
            lastHapticMilestone = milestone
            Haptics.success()
        }
    }

    func sync(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        guard online else {
            errorMessage = "Supply sync requires a network connection."
            return
        }
        isSyncing = true
        defer { isSyncing = false }
        do {
            let response = try await api.syncSupply()
            list = response.list
            await snapshots.save(SupplyResponse(list: response.list), domain: SnapshotDomain.supply, organizationId: organizationId)
            await loadCargoLinks(api: api, snapshots: snapshots, organizationId: organizationId, online: true)
            Haptics.success()
            if let refreshOutcomes {
                SnapshotRefreshPolicy.recordRefreshSuccess(
                    outcomes: refreshOutcomes,
                    organizationId: organizationId,
                    domain: SnapshotDomain.supply
                )
            }
        } catch {
            if SnapshotRefreshPolicy.isIgnorableRefreshError(error) { return }
            if let refreshOutcomes {
                SnapshotRefreshPolicy.recordRefreshFailure(
                    outcomes: refreshOutcomes,
                    organizationId: organizationId,
                    domain: SnapshotDomain.supply,
                    error: error
                )
            }
            errorMessage = SnapshotRefreshPolicy.userFacingRefreshDetail(error)
        }
    }

    @discardableResult
    func addItem(
        _ request: CreateSupplyItemRequest,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async -> Bool {
        guard online else {
            errorMessage = "Adding items requires a network connection."
            return false
        }
        do {
            let response = try await api.addSupplyItem(request)
            if var current = list {
                current = SupplyList(
                    id: current.id,
                    name: current.name,
                    items: current.items + [response.item]
                )
                list = current
                await snapshots.save(SupplyResponse(list: current), domain: SnapshotDomain.supply, organizationId: organizationId)
            } else {
                await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
            }
            errorMessage = nil
            return true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }

    func dock(
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String,
        isCrewMember: Bool
    ) async {
        guard let list else { return }
        guard online else {
            errorMessage = "Docking requires a network connection."
            return
        }
        isDocking = true
        defer { isDocking = false }
        do {
            let result = try await api.completeSupply(listId: list.id)
            Haptics.success()
            errorMessage = nil
            paywallContext = nil
            dockMessage = "Docked \(result.docked) items into Cargo"
            lastHapticMilestone = 0
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        } catch let error as APIError {
            if let ctx = CapacityUpgrade.context(from: error, isCrewMember: isCrewMember) {
                paywallContext = ctx
                errorMessage = nil
            } else {
                errorMessage = error.errorDescription
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func scanReceiptAndFetchMatch(
        image: UIImage,
        api: RationAPI
    ) async -> SupplyScanReviewContext? {
        guard let data = image.resizedJPEG(maxDimension: 1024, quality: 0.7) else {
            errorMessage = "Could not process the image."
            return nil
        }
        return await scanFileAndFetchMatch(
            data: data,
            filename: "receipt.jpg",
            mimeType: "image/jpeg",
            api: api
        )
    }

    func scanFileAndFetchMatch(
        data: Data,
        filename: String,
        mimeType: String,
        api: RationAPI
    ) async -> SupplyScanReviewContext? {
        guard let list else { return nil }
        let generation = workGeneration
        isScanning = true
        scanStatusMessage = "Uploading receipt…"
        errorMessage = nil
        defer {
            if generation == workGeneration {
                isScanning = false
                scanStatusMessage = nil
            }
        }

        do {
            let response = try await api.submitScanFile(data: data, filename: filename, mimeType: mimeType)
            guard generation == workGeneration else { return nil }
            guard let requestId = response.requestId else {
                errorMessage = "Scan was submitted but no request id was returned."
                return nil
            }
            Haptics.light()
            scanStatusMessage = "Extracting items…"
            let completed = await pollScanCompletion(requestId: requestId, api: api, generation: generation)
            guard completed, generation == workGeneration else { return nil }

            scanStatusMessage = "Matching to supply list…"
            let match = try await api.fetchSupplyScanMatch(listId: list.id, requestId: requestId)
            guard generation == workGeneration else { return nil }
            return SupplyScanReviewContext(listId: list.id, requestId: requestId, match: match)
        } catch is CancellationError {
            return nil
        } catch {
            guard generation == workGeneration else { return nil }
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }

    private func pollScanCompletion(requestId: String, api: RationAPI, generation: Int) async -> Bool {
        for _ in 0..<maxPollAttempts {
            guard generation == workGeneration else { return false }
            do {
                try await Task.sleep(nanoseconds: pollDelayNanoseconds)
                guard generation == workGeneration else { return false }
                let result = try await api.scanStatus(requestId: requestId)
                switch result.status {
                case "completed":
                    return true
                case "failed":
                    errorMessage = ScanUserFacingError.message(from: result.error)
                    return false
                default:
                    scanStatusMessage = "Extracting items…"
                }
            } catch is CancellationError {
                return false
            } catch {
                if let apiError = error as? APIError,
                   case .unauthorized = apiError {
                    errorMessage = apiError.errorDescription
                    return false
                }
                // Keep polling on transient errors.
            }
        }
        errorMessage = "Receipt scan timed out. Try again."
        return false
    }

    func deleteItem(_ item: SupplyItem, api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        guard online else { return }
        do {
            try await MutationRetry.once {
                try await api.deleteSupplyItem(item.id)
            }
            guard !Task.isCancelled else { return }
            Haptics.light()
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        } catch {
            guard !Task.isCancelled else { return }
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func snooze(
        _ item: SupplyItem,
        duration: String,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async {
        guard online else {
            errorMessage = "Snoozing requires a network connection."
            return
        }
        do {
            _ = try await api.snoozeSupplyItem(item.id, duration: duration)
            Haptics.light()
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func unsnooze(
        _ snooze: SupplySnooze,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async {
        guard online else { return }
        do {
            _ = try await api.unsnoozeSupplyItem(snooze.id)
            Haptics.light()
            await loadSnoozes(api: api)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

private extension SupplyItem {
    func withPurchased(_ value: Bool) -> SupplyItem {
        SupplyItem(
            id: id,
            name: name,
            quantity: quantity,
            unit: unit,
            domain: domain,
            isPurchased: value,
            sourceOrigins: sourceOrigins
        )
    }
}

