import SwiftUI
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
    var refreshOutcomes: SnapshotRefreshOutcomeStore?
    private var lastHapticMilestone = 0
    private let maxPollAttempts = 80
    private let pollDelayNanoseconds: UInt64 = 1_500_000_000

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
                _ = try await api.updateSupplyItem(item.id, quantity: nil, unit: nil, isPurchased: false)
            } catch {
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
            _ = try await api.updateSupplyItem(item.id, quantity: quantity, unit: unit, isPurchased: true)
        } catch {
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

    func dock(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
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
            dockMessage = "Docked \(result.docked) items into Cargo"
            lastHapticMilestone = 0
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
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
        isScanning = true
        scanStatusMessage = "Uploading receipt…"
        errorMessage = nil
        defer {
            isScanning = false
            scanStatusMessage = nil
        }

        do {
            let response = try await api.submitScanFile(data: data, filename: filename, mimeType: mimeType)
            guard let requestId = response.requestId else {
                errorMessage = "Scan was submitted but no request id was returned."
                return nil
            }
            Haptics.light()
            scanStatusMessage = "Extracting items…"
            let completed = await pollScanCompletion(requestId: requestId, api: api)
            guard completed else { return nil }

            scanStatusMessage = "Matching to supply list…"
            let match = try await api.fetchSupplyScanMatch(listId: list.id, requestId: requestId)
            return SupplyScanReviewContext(listId: list.id, requestId: requestId, match: match)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }

    private func pollScanCompletion(requestId: String, api: RationAPI) async -> Bool {
        for attempt in 0..<maxPollAttempts {
            do {
                try await Task.sleep(nanoseconds: pollDelayNanoseconds)
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
                   [429, 503].contains(apiError.statusCode ?? 0),
                   attempt < maxPollAttempts - 1
                {
                    continue
                }
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                return false
            }
        }
        errorMessage = "Scan is still processing. Try again shortly."
        return false
    }

    func deleteItem(_ item: SupplyItem, api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        guard online else { return }
        do {
            try await api.deleteSupplyItem(item.id)
            Haptics.light()
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        } catch {
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

struct CheckOffPresentationItem: Identifiable {
    let id: String
    let item: SupplyItem

    init(item: SupplyItem) {
        self.item = item
        self.id = "\(item.id)-\(item.isPurchased)-\(item.quantity)-\(item.unit)"
    }
}

struct SupplyView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(CopilotScrollContext.self) private var scrollContext
    var isTabActive: Bool = false
    var onOpenSettings: () -> Void = {}
    var onOpenGroupSettings: () -> Void = {}
    @State private var model = SupplyViewModel()
    @State private var showingOptions = false
    @State private var showingFilters = false
    @State private var checkOffItem: CheckOffPresentationItem?
    @State private var supplyShareURL: String?
    @State private var supplyShareExpiresAt: String?
    @State private var isLoadingShare = false
    @State private var supplyWindow: SupplyPlanningWindow?
    @State private var snoozeItem: SupplyItem?
    @State private var showingPaywall = false
    @State private var showingAddItem = false
    @State private var hasTriggeredAutoSync = false
    @State private var showingReplenishReceipt = false
    @State private var showingSupplyScanCamera = false
    @State private var showingSupplyScanPhotoLibrary = false
    @State private var supplyScanReviewContext: SupplyScanReviewContext?
    @State private var scanConsent = AIConsentCoordinator()

    private var scanCreditCost: Int {
        env.session.session?.aiCosts?.scan ?? 1
    }

    private var organizationId: String? {
        env.session.activeOrganizationId
    }

    private var loadTaskKey: String {
        "\(organizationId ?? "nil")-\(isTabActive)-\(env.lifecycle.refreshToken(forTab: 4))"
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.list == nil {
                    LoadingView()
                } else if let list = model.list, (model.totalCount > 0 || model.filters.hasActiveFilters), let organizationId {
                    listView(list, organizationId: organizationId)
                } else {
                    CopilotTrackableScrollSurface(
                        tab: 4,
                        isActive: isTabActive,
                        hasTabAction: true
                    ) {
                        VStack(spacing: 16) {
                            EmptyStateView(
                                icon: "cart",
                                title: "No supply delta yet",
                                message: "Add items manually, select meals in Galley, mark Cargo for restock, or plan meals in Manifest."
                            )
                            Button("Add item") {
                                showingAddItem = true
                            }
                            .buttonStyle(PrimaryButtonStyle())
                            .disabled(!env.network.isOnline)
                            Button("Refresh list") {
                                Task {
                                    guard let organizationId else { return }
                                    model.refreshOutcomes = env.refreshOutcomes
                                    await model.sync(
                                        api: env.api,
                                        snapshots: env.snapshots,
                                        online: env.network.isOnline,
                                        organizationId: organizationId
                                    )
                                }
                            }
                            .buttonStyle(SecondaryButtonStyle())
                            .disabled(model.isSyncing)
                        }
                        .padding(24)
                    }
                }
            }
            .navigationTitle("Supply")
            .searchable(text: $model.filters.search, prompt: "Search items")
            .toolbar {
                GlobalPageToolbar(
                    hasActiveFilters: model.filters.hasActiveFilters,
                    syncDomain: SnapshotDomain.supply,
                    organizationId: organizationId,
                    isRefreshing: model.isRefreshing,
                    onOptions: { showingOptions = true },
                    onOpenGroupSettings: onOpenGroupSettings,
                    onOpenSettings: onOpenSettings
                )
            }
            .background(Theme.ceramic)
            .safeAreaInset(edge: .top, spacing: 0) {
                if model.filters.domain != nil {
                    ActiveFilterChipRail(
                        domain: model.filters.domain,
                        onClearDomain: { model.filters.domain = nil }
                    )
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.ceramic)
                }
            }
            .dataSyncBanner(
                domain: SnapshotDomain.supply,
                organizationId: organizationId,
                isRefreshing: model.isRefreshing || model.isSyncing
            )
            .sheet(isPresented: $showingOptions) {
                SupplyOptionsSheet(
                    shareURL: supplyShareURL,
                    shareExpiresAt: supplyShareExpiresAt,
                    isLoadingShare: isLoadingShare,
                    isSyncing: model.isSyncing,
                    canManageSupplySettings: env.session.activeOrg?.canManageSupplySettings == true,
                    supplyWindow: supplyWindow,
                    onRefreshFromMeals: {
                        guard let organizationId else { return }
                        model.refreshOutcomes = env.refreshOutcomes
                        await model.sync(
                            api: env.api,
                            snapshots: env.snapshots,
                            online: env.network.isOnline,
                            organizationId: organizationId
                        )
                    },
                    onShare: { await createSupplyShare() },
                    onRevokeShare: { await revokeSupplyShare() },
                    onUpgradeRequired: { showingPaywall = true },
                    onOpenFilters: {
                        showingOptions = false
                        showingFilters = true
                    },
                    onPatchHorizon: { days in
                        guard env.network.isOnline else { return }
                        do {
                            let response = try await env.api.patchOrganizationSupplySettings(
                                manifestHorizonDays: days
                            )
                            supplyWindow = response.window
                            Haptics.success()
                        } catch {
                            model.errorMessage = (error as? APIError)?.errorDescription
                                ?? error.localizedDescription
                        }
                    }
                )
                .task {
                    await loadSupplyShareStatus()
                    await loadSupplySettings()
                }
            }
            .sheet(isPresented: $showingFilters) {
                FilterOptionsSheet(
                    filters: model.filters,
                    onApplySupplyUnitMode: { mode in
                        Task {
                            let displayMode = UnitDisplayMode(rawValue: mode) ?? .metric
                            env.unitDisplayMode.apply(displayMode)
                            do {
                                let response = try await env.api.patchSettings(
                                    env.unitDisplayMode.settingsPatch(for: displayMode)
                                )
                                env.launch.updateUserSettings(response.settings)
                            } catch {
                                // Preference already applied locally; server sync best-effort
                            }
                        }
                    }
                )
            }
            .sheet(item: $checkOffItem) { presentation in
                SupplyItemCheckOffSheet(item: presentation.item) { quantity, unit in
                    guard let organizationId else { return }
                    await model.markPurchased(
                        presentation.item,
                        quantity: quantity,
                        unit: unit,
                        api: env.api,
                        snapshots: env.snapshots,
                        online: env.network.isOnline,
                        organizationId: organizationId
                    )
                }
            }
            .sheet(item: $snoozeItem) { item in
                SnoozeDurationSheet(itemName: item.name) { duration in
                    guard let organizationId else { return }
                    await model.snooze(
                        item,
                        duration: duration,
                        api: env.api,
                        snapshots: env.snapshots,
                        online: env.network.isOnline,
                        organizationId: organizationId
                    )
                }
            }
            .sheet(isPresented: $showingPaywall) { PaywallView() }
            .sheet(isPresented: $showingAddItem) {
                SupplyAddItemSheet(
                    defaultDomain: model.filters.domain?.rawValue ?? "food",
                    serverError: $model.errorMessage
                ) { request in
                    guard let organizationId else { return false }
                    let success = await model.addItem(
                        request,
                        api: env.api,
                        snapshots: env.snapshots,
                        online: env.network.isOnline,
                        organizationId: organizationId
                    )
                    return success
                }
            }
            .sheet(isPresented: $showingReplenishReceipt) {
                ReplenishReceiptSheet(
                    creditCost: scanCreditCost,
                    onCamera: {
                        showingReplenishReceipt = false
                        scanConsent.presentIfNeeded(session: env.session) {
                            showingSupplyScanCamera = true
                        }
                    },
                    onPhotoLibrary: {
                        showingReplenishReceipt = false
                        scanConsent.presentIfNeeded(session: env.session) {
                            showingSupplyScanPhotoLibrary = true
                        }
                    },
                    onFile: { data, filename, mimeType in
                        showingReplenishReceipt = false
                        scanConsent.presentIfNeeded(session: env.session) {
                            Task { await runSupplyScan(data: data, filename: filename, mimeType: mimeType) }
                        }
                    }
                )
            }
            .sheet(item: $supplyScanReviewContext) { context in
                SupplyScanReviewView(context: context) {
                    Task {
                        guard let organizationId else { return }
                        model.refreshOutcomes = env.refreshOutcomes
                        await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.supply) {
                            await model.load(
                                api: env.api,
                                snapshots: env.snapshots,
                                online: env.network.isOnline,
                                organizationId: organizationId
                            )
                        }
                    }
                }
            }
            .sheet(isPresented: Binding(
                get: { scanConsent.isPresenting },
                set: { if !$0 { scanConsent.decline() } }
            )) {
                AIConsentGateView(
                    onAccept: { Task { await scanConsent.accept(api: env.api, session: env.session) } },
                    onDecline: { scanConsent.decline() }
                )
                .presentationDetents([.large])
            }
            .fullScreenCover(isPresented: $showingSupplyScanCamera) {
                CameraPicker(sourceType: .camera) { image in
                    showingSupplyScanCamera = false
                    guard let image else { return }
                    Task { await runSupplyScan(image: image) }
                }
                .ignoresSafeArea()
            }
            .fullScreenCover(isPresented: $showingSupplyScanPhotoLibrary) {
                CameraPicker(sourceType: .photoLibrary) { image in
                    showingSupplyScanPhotoLibrary = false
                    guard let image else { return }
                    Task { await runSupplyScan(image: image) }
                }
                .ignoresSafeArea()
            }
            .fullScreenCover(isPresented: Binding(
                get: { model.isScanning },
                set: { _ in }
            )) {
                AIProcessingView(feature: .supplyReplenish, creditCost: scanCreditCost)
            }
            .overlay(alignment: .bottom) {
                if let message = model.dockMessage {
                    TransientSuccessToast(message: message) {
                        model.dockMessage = nil
                    }
                    .padding(
                        .bottom,
                        CopilotDockLayout.toastBottomOffset(
                            isExpanded: scrollContext.isExpanded,
                            keyboardInset: 0
                        )
                    )
                }
            }
        }
        .tabDockAction(tag: 4) {
            IconFABMenuCore(
                systemImage: "plus.circle.fill",
                accessibilityLabel: "Supply actions",
                disabled: model.isDocking || model.isScanning || !env.network.isOnline
            ) {
                if model.totalCount > 0 {
                    if env.session.clientFlags.isAiDockFromReceiptEnabled {
                        Button {
                            showingReplenishReceipt = true
                        } label: {
                            Label("Dock from Receipt", systemImage: "camera.fill")
                        }
                    }
                    Button {
                        Task {
                            guard let organizationId else { return }
                            await model.dock(
                                api: env.api,
                                snapshots: env.snapshots,
                                online: env.network.isOnline,
                                organizationId: organizationId
                            )
                            env.notifyCargoDataChanged()
                        }
                    } label: {
                        Label("Dock from List", systemImage: "checkmark.circle.fill")
                    }
                    .disabled(model.purchasedCount == 0 || model.isDocking)
                }
                Button {
                    showingAddItem = true
                } label: {
                    Label("Add item", systemImage: "plus")
                }
                if model.totalCount == 0 {
                    Button {
                        Task {
                            guard let organizationId else { return }
                            model.refreshOutcomes = env.refreshOutcomes
                            await model.sync(
                                api: env.api,
                                snapshots: env.snapshots,
                                online: env.network.isOnline,
                                organizationId: organizationId
                            )
                        }
                    } label: {
                        Label("Refresh list", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .disabled(model.isSyncing)
                }
            }
        }
        .task(id: loadTaskKey) {
            guard isTabActive, let organizationId else { return }
            model.refreshOutcomes = env.refreshOutcomes
            await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.supply) {
                await model.load(
                    api: env.api,
                    snapshots: env.snapshots,
                    online: env.network.isOnline,
                    organizationId: organizationId
                )
            }
            model.filters.supplyUnitMode = env.unitDisplayMode.mode.rawValue
            supplyShareURL = try? await env.api.supplyShareStatus().shareUrl
            supplyShareExpiresAt = try? await env.api.supplyShareStatus().shareExpiresAt
            if env.network.isOnline, !hasTriggeredAutoSync {
                hasTriggeredAutoSync = true
                await model.sync(
                    api: env.api,
                    snapshots: env.snapshots,
                    online: true,
                    organizationId: organizationId
                )
            }
        }
    }

    private func listView(_ list: SupplyList, organizationId: String) -> some View {
        List {
            if model.totalCount > 0 {
                Section {
                    EmptyView()
                } header: {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("\(model.purchasedCount)/\(model.totalCount) bought")
                                .rationCaption()
                                .foregroundStyle(Theme.muted)
                            Spacer()
                        }
                        ThinProgressBar(progress: model.progressFraction)
                    }
                    .padding(.vertical, 4)
                    .textCase(nil)
                }
            }
            if let errorMessage = model.errorMessage {
                ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
            }
            SnoozedItemsSection(
                snoozes: model.snoozes,
                cargoLinkRows: model.cargoLinkRows
            ) { snooze in
                await model.unsnooze(
                    snooze,
                    api: env.api,
                    snapshots: env.snapshots,
                    online: env.network.isOnline,
                    organizationId: organizationId
                )
            }
            if model.showsFilteredEmptyState {
                Section {
                    EmptyStateView(
                        icon: "magnifyingglass",
                        title: "No matches",
                        message: "Try adjusting your filters or search."
                    )
                    .listRowBackground(Color.clear)
                }
            } else {
                ForEach(model.displayedItems) { item in
                    SupplyListItemRow(
                        item: item,
                        cargoLinkRows: model.cargoLinkRows,
                        onCheckOff: {
                            if item.isPurchased {
                                Task {
                                    await model.toggle(item, api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                                }
                            } else {
                                checkOffItem = CheckOffPresentationItem(item: item)
                            }
                        },
                        onCheck: {
                            Task {
                                await model.toggle(item, api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                            }
                        },
                        onSnooze: { snoozeItem = item },
                        onDelete: {
                            Task {
                                await model.deleteItem(item, api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                            }
                        }
                    )
                    .listRowBackground(Theme.surface)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .refreshable {
            model.refreshOutcomes = env.refreshOutcomes
            if env.network.isOnline {
                await model.sync(
                    api: env.api,
                    snapshots: env.snapshots,
                    online: true,
                    organizationId: organizationId
                )
            } else {
                await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.supply) {
                    await model.load(
                        api: env.api,
                        snapshots: env.snapshots,
                        online: false,
                        organizationId: organizationId
                    )
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .copilotDockScrollMargins(
            hasTabAction: true
        )
        .copilotScrollTracked(tab: 4, isActive: isTabActive)
    }

    private func loadSupplySettings() async {
        guard env.network.isOnline else { return }
        do {
            let response = try await env.api.organizationSupplySettings()
            supplyWindow = response.window
        } catch {
            // Non-fatal — options sheet falls back to defaults.
        }
    }

    private func loadSupplyShareStatus() async {
        isLoadingShare = true
        defer { isLoadingShare = false }
        do {
            let status = try await env.api.supplyShareStatus()
            supplyShareURL = status.shareUrl
            supplyShareExpiresAt = status.shareExpiresAt
        } catch {}
    }

    private func createSupplyShare() async {
        do {
            let response = try await env.api.createSupplyShare()
            supplyShareURL = response.shareUrl
            supplyShareExpiresAt = response.shareExpiresAt
            Haptics.success()
        } catch let error as APIError {
            if error.statusCode == 403 {
                showingPaywall = true
            }
        } catch {}
    }

    private func revokeSupplyShare() async {
        _ = try? await env.api.revokeSupplyShare()
        supplyShareURL = nil
        supplyShareExpiresAt = nil
        Haptics.light()
    }

    private func runSupplyScan(image: UIImage) async {
        if let context = await model.scanReceiptAndFetchMatch(image: image, api: env.api) {
            supplyScanReviewContext = context
        }
    }

    private func runSupplyScan(data: Data, filename: String, mimeType: String) async {
        if let context = await model.scanFileAndFetchMatch(
            data: data,
            filename: filename,
            mimeType: mimeType,
            api: env.api
        ) {
            supplyScanReviewContext = context
        }
    }
}

private struct SupplyListItemRow: View {
    let item: SupplyItem
    let cargoLinkRows: [CargoLinkResolver.Row]
    let onCheckOff: () -> Void
    let onCheck: () -> Void
    let onSnooze: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack {
            Button(action: onCheckOff) {
                Image(systemName: item.isPurchased ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(item.isPurchased ? Theme.hyperGreen : Theme.muted)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityLabel(
                item.isPurchased
                    ? "Mark \(item.name) not purchased"
                    : "Check off \(item.name)"
            )

            VStack(alignment: .leading, spacing: 4) {
                supplyItemName
                if !item.resolvedSourceOrigins.isEmpty {
                    SupplyItemOriginBadge(origins: item.resolvedSourceOrigins)
                }
            }

            Spacer()

            DisplayQuantityLabel(
                quantity: item.quantity,
                unit: item.unit,
                baseQuantity: item.baseQuantity,
                baseUnit: item.baseUnit,
                ingredientName: item.name
            )
            .rationCaption()
        }
        .swipeActions(edge: .leading) {
            if !item.isPurchased {
                Button(action: onCheck) {
                    Label("Check", systemImage: "checkmark")
                }
                .tint(Theme.hyperGreen)
            }
        }
        .swipeActions {
            if !item.isPurchased {
                Button(action: onSnooze) {
                    Label("Snooze", systemImage: "moon.zzz")
                }
                .tint(Theme.carbon.opacity(0.6))
            }
            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
            .destructiveDeleteTint()
        }
    }

    @ViewBuilder
    private var supplyItemName: some View {
        if let cargoId = CargoLinkResolver.resolveCargoId(forName: item.name, in: cargoLinkRows),
           !item.isPurchased {
            NavigationLink {
                CargoDetailView(itemId: cargoId)
            } label: {
                Text(item.name.capitalized)
                    .rationBody()
                    .foregroundStyle(Theme.carbon)
            }
            .buttonStyle(.plain)
        } else {
            Text(item.name.capitalized)
                .rationBody()
                .strikethrough(item.isPurchased)
                .foregroundStyle(item.isPurchased ? Theme.muted : Theme.carbon)
        }
    }
}
