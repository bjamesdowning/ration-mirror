import SwiftUI
import UIKit
import Observation

@MainActor
@Observable
final class SupplyViewModel {
    private(set) var list: SupplyList?
    private(set) var isLoading = false
    private(set) var isSyncing = false
    private(set) var isDocking = false
    private(set) var isScanning = false
    private(set) var scanStatusMessage: String?
    private(set) var snoozes: [SupplySnooze] = []
    var errorMessage: String?
    var dockMessage: String?
    private var lastHapticMilestone = 0
    private let maxPollAttempts = 80
    private let pollDelayNanoseconds: UInt64 = 1_500_000_000

    var filters = PageFilterState(configuration: PageFilterConfiguration(
        supportsSupplySort: true,
        supportsSupplyUnitMode: true
    ))

    var displayedItems: [SupplyItem] {
        guard let items = list?.items else { return [] }
        return PageFilterEngine.filterSupplyItems(items, sortMode: filters.supplySort, hidePurchased: filters.hidePurchased)
    }

    var purchasedCount: Int {
        list?.items.filter(\.isPurchased).count ?? 0
    }

    var totalCount: Int {
        list?.items.count ?? 0
    }

    var progressFraction: Double {
        guard totalCount > 0 else { return 0 }
        return Double(purchasedCount) / Double(totalCount)
    }

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if online {
            do {
                list = try await api.supply().list
                if let list {
                    snapshots.save(SupplyResponse(list: list), domain: SnapshotDomain.supply, organizationId: organizationId)
                }
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                restoreSnapshot(snapshots, organizationId: organizationId)
            }
        } else {
            restoreSnapshot(snapshots, organizationId: organizationId)
        }
        if online {
            await loadSnoozes(api: api)
        }
    }

    func loadSnoozes(api: RationAPI) async {
        do {
            snoozes = try await api.supplySnoozes().snoozes
        } catch {
            // Non-fatal — snooze panel hides when empty.
        }
    }

    private func restoreSnapshot(_ snapshots: SnapshotStore, organizationId: String) {
        if let cached = snapshots.load(SupplyResponse.self, domain: SnapshotDomain.supply, organizationId: organizationId) {
            list = cached.payload.list
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
                ? SupplyItem(id: existing.id, name: existing.name, quantity: quantity, unit: unit, domain: existing.domain, isPurchased: true)
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
            snapshots.save(SupplyResponse(list: response.list), domain: SnapshotDomain.supply, organizationId: organizationId)
            Haptics.success()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
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
        guard let list else { return nil }
        isScanning = true
        scanStatusMessage = "Uploading receipt…"
        errorMessage = nil
        defer {
            isScanning = false
            scanStatusMessage = nil
        }

        guard let data = image.resizedJPEG(maxDimension: 1024, quality: 0.7) else {
            errorMessage = "Could not process the image."
            return nil
        }

        do {
            let response = try await api.submitScan(imageData: data)
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
                    errorMessage = result.error ?? "Scan failed. Please try again."
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
        SupplyItem(id: id, name: name, quantity: quantity, unit: unit, domain: domain, isPurchased: value)
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
    var onOpenSettings: () -> Void = {}
    @State private var model = SupplyViewModel()
    @State private var showingOptions = false
    @State private var showingFilters = false
    @State private var checkOffItem: CheckOffPresentationItem?
    @State private var supplyShareURL: String?
    @State private var supplyShareExpiresAt: String?
    @State private var isLoadingShare = false
    @State private var snoozeItem: SupplyItem?
    @State private var showingPaywall = false
    @State private var hasTriggeredAutoSync = false
    @State private var showGroupSettings = false
    @State private var showingReplenishSheet = false
    @State private var showingSupplyScanCamera = false
    @State private var supplyScanReviewContext: SupplyScanReviewContext?
    @State private var scanConsent = AIConsentCoordinator()
    @State private var showingScanPaywall = false

    private var organizationId: String {
        env.session.activeOrganizationId ?? "unknown"
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.list == nil {
                    LoadingView()
                } else if let list = model.list, !list.items.isEmpty {
                    listView(list)
                } else {
                    VStack(spacing: 16) {
                        EmptyStateView(
                            icon: "cart",
                            title: "No supply delta yet",
                            message: "Select meals in Galley and your list will refresh when you open Supply."
                        )
                        Button("Refresh from meals") {
                            Task { await model.sync(api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId) }
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(model.isSyncing)
                    }
                    .padding(24)
                }
            }
            .navigationTitle("Supply")
            .toolbar {
                GlobalPageToolbar(
                    hasActiveFilters: model.filters.hasActiveFilters,
                    syncDomain: SnapshotDomain.supply,
                    organizationId: organizationId,
                    onOptions: { showingOptions = true },
                    onOpenGroupSettings: { showGroupSettings = true },
                    onOpenSettings: onOpenSettings
                )
            }
            .navigationDestination(isPresented: $showGroupSettings) {
                GroupSettingsView()
            }
            .background(Theme.ceramic)
            .sheet(isPresented: $showingOptions) {
                SupplyOptionsSheet(
                    shareURL: supplyShareURL,
                    shareExpiresAt: supplyShareExpiresAt,
                    isLoadingShare: isLoadingShare,
                    isSyncing: model.isSyncing,
                    onRefreshFromMeals: {
                        await model.sync(api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                    },
                    onShare: { await createSupplyShare() },
                    onRevokeShare: { await revokeSupplyShare() },
                    onUpgradeRequired: { showingPaywall = true },
                    onOpenFilters: {
                        showingOptions = false
                        showingFilters = true
                    }
                )
                .task { await loadSupplyShareStatus() }
            }
            .sheet(isPresented: $showingFilters) {
                FilterOptionsSheet(
                    filters: model.filters,
                    onApplySupplyUnitMode: { mode in
                        Task {
                            _ = try? await env.api.patchSettings(SettingsPatch(supplyUnitMode: mode))
                        }
                    }
                )
            }
            .sheet(item: $checkOffItem) { presentation in
                SupplyItemCheckOffSheet(item: presentation.item) { quantity, unit in
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
            .sheet(isPresented: $showingReplenishSheet) {
                ReplenishSheet(
                    purchasedCount: model.purchasedCount,
                    isDocking: model.isDocking,
                    onScanReceipt: {
                        showingReplenishSheet = false
                        proceedToSupplyScan()
                    },
                    onDockPurchased: {
                        showingReplenishSheet = false
                        Task {
                            await model.dock(
                                api: env.api,
                                snapshots: env.snapshots,
                                online: env.network.isOnline,
                                organizationId: organizationId
                            )
                            env.notifyCargoDataChanged()
                        }
                    }
                )
            }
            .sheet(item: $supplyScanReviewContext) { context in
                SupplyScanReviewView(context: context) {
                    Task {
                        await model.load(
                            api: env.api,
                            snapshots: env.snapshots,
                            online: env.network.isOnline,
                            organizationId: organizationId
                        )
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
            .sheet(isPresented: $showingScanPaywall) { PaywallView() }
            .fullScreenCover(isPresented: $showingSupplyScanCamera) {
                CameraPicker { image in
                    showingSupplyScanCamera = false
                    guard let image else { return }
                    Task {
                        if let context = await model.scanReceiptAndFetchMatch(image: image, api: env.api) {
                            supplyScanReviewContext = context
                        }
                    }
                }
                .ignoresSafeArea()
            }
            .overlay {
                if model.isScanning {
                    ZStack {
                        Color.black.opacity(0.25).ignoresSafeArea()
                        GlassCard {
                            VStack(spacing: 12) {
                                ProgressView().tint(Theme.hyperGreen)
                                Text(model.scanStatusMessage ?? "Processing receipt…")
                                    .rationBody()
                                    .multilineTextAlignment(.center)
                            }
                            .padding(8)
                        }
                        .padding(32)
                    }
                }
            }
            .overlay(alignment: .bottom) {
                if let message = model.dockMessage {
                    TransientSuccessToast(message: message) {
                        model.dockMessage = nil
                    }
                    .padding(.bottom, 80)
                }
            }
            .safeAreaInset(edge: .bottom) {
                if model.totalCount > 0 {
                    IconFAB(
                        systemImage: "shippingbox.and.arrow.backward.fill",
                        accessibilityLabel: "Replenish Cargo",
                        disabled: model.isDocking || model.isScanning || !env.network.isOnline
                    ) {
                        Button {
                            showingReplenishSheet = true
                        } label: {
                            Label("Replenish Cargo", systemImage: "shippingbox.and.arrow.backward")
                        }
                    }
                }
            }
        }
        .task(id: organizationId) {
            await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
            if let mode = try? await env.api.settings().settings.supplyUnitMode {
                model.filters.supplyUnitMode = mode
            }
            supplyShareURL = try? await env.api.supplyShareStatus().shareUrl
            supplyShareExpiresAt = try? await env.api.supplyShareStatus().shareExpiresAt
            if env.network.isOnline, !hasTriggeredAutoSync {
                hasTriggeredAutoSync = true
                await model.sync(api: env.api, snapshots: env.snapshots, online: true, organizationId: organizationId)
            }
        }
    }

    private func listView(_ list: SupplyList) -> some View {
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
            SnoozedItemsSection(snoozes: model.snoozes) { snooze in
                await model.unsnooze(
                    snooze,
                    api: env.api,
                    snapshots: env.snapshots,
                    online: env.network.isOnline,
                    organizationId: organizationId
                )
            }
            ForEach(model.displayedItems) { item in
                Button {
                    if item.isPurchased {
                        Task {
                            await model.toggle(item, api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                        }
                    } else {
                        checkOffItem = CheckOffPresentationItem(item: item)
                    }
                } label: {
                    HStack {
                        Image(systemName: item.isPurchased ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(item.isPurchased ? Theme.hyperGreen : Theme.muted)
                        Text(item.name.capitalized)
                            .rationBody()
                            .strikethrough(item.isPurchased)
                            .foregroundStyle(item.isPurchased ? Theme.muted : Theme.carbon)
                        Spacer()
                        Text("\(item.quantity.formatted()) \(item.unit)").rationCaption()
                    }
                }
                .id("\(item.id)-\(item.isPurchased)-\(item.quantity)-\(item.unit)")
                .listRowBackground(Theme.surface)
                .swipeActions(edge: .leading) {
                    if !item.isPurchased {
                        Button {
                            Task {
                                await model.toggle(item, api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                            }
                        } label: {
                            Label("Check", systemImage: "checkmark")
                        }
                        .tint(Theme.hyperGreen)
                    }
                }
                .swipeActions {
                    if !item.isPurchased {
                        Button {
                            snoozeItem = item
                        } label: {
                            Label("Snooze", systemImage: "moon.zzz")
                        }
                        .tint(Theme.carbon.opacity(0.6))
                    }
                    Button(role: .destructive) {
                        Task {
                            await model.deleteItem(item, api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                        }
                    } label: { Label("Delete", systemImage: "trash") }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .refreshable {
            if env.network.isOnline {
                await model.sync(api: env.api, snapshots: env.snapshots, online: true, organizationId: organizationId)
            } else {
                await model.load(api: env.api, snapshots: env.snapshots, online: false, organizationId: organizationId)
            }
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
            if case .server(let status, _, _, _, _) = error, status == 403 {
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

    private func proceedToSupplyScan() {
        scanConsent.presentIfNeeded(session: env.session) {
            showingSupplyScanCamera = true
        }
    }
}

struct ReplenishSheet: View {
    @Environment(\.dismiss) private var dismiss
    let purchasedCount: Int
    let isDocking: Bool
    let onScanReceipt: () -> Void
    let onDockPurchased: () -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("After shopping, dock items from your list or scan a receipt to reconcile and add to Cargo.")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)

                Button(action: onScanReceipt) {
                    replenishOption(
                        icon: "camera.fill",
                        title: "From receipt",
                        subtitle: "Scan or upload — match to your supply list",
                        highlighted: true
                    )
                }
                .buttonStyle(.plain)

                Button(action: onDockPurchased) {
                    replenishOption(
                        icon: "checkmark.circle.fill",
                        title: "From purchased list",
                        subtitle: purchasedCount > 0
                            ? "Dock \(purchasedCount) checked-off item\(purchasedCount == 1 ? "" : "s")"
                            : "Check off items while shopping first",
                        highlighted: false
                    )
                }
                .buttonStyle(.plain)
                .disabled(purchasedCount == 0 || isDocking)
                .opacity(purchasedCount == 0 || isDocking ? 0.5 : 1)

                Spacer()
            }
            .padding(20)
            .navigationTitle("Replenish Cargo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .background(Theme.ceramic)
        }
        .presentationDetents([.medium])
    }

    @ViewBuilder
    private func replenishOption(
        icon: String,
        title: String,
        subtitle: String,
        highlighted: Bool
    ) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(highlighted ? Theme.hyperGreen : Theme.carbon)
                .frame(width: 40, height: 40)
                .background(highlighted ? Theme.hyperGreen.opacity(0.15) : Theme.platinum)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .rationBody()
                    .fontWeight(.semibold)
                Text(subtitle)
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Theme.platinum, lineWidth: 1)
        )
    }
}
