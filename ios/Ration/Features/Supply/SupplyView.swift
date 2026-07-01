import SwiftUI
import Observation

@MainActor
@Observable
final class SupplyViewModel {
    private(set) var list: SupplyList?
    private(set) var isLoading = false
    private(set) var isSyncing = false
    private(set) var isDocking = false
    private(set) var snoozes: [SupplySnooze] = []
    var errorMessage: String?
    var dockMessage: String?
    private var lastHapticMilestone = 0
    var undoBuffer = UndoBuffer<SupplyUndoAction>()

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
            undoBuffer.record(SupplyUndoAction(
                itemId: item.id,
                previousPurchased: false,
                previousQuantity: item.quantity,
                previousUnit: item.unit
            ))
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

    func undoCheckoff(
        _ action: SupplyUndoAction,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async {
        guard let current = list else {
            undoBuffer.clear()
            return
        }
        let updatedItems = current.items.map { existing in
            guard existing.id == action.itemId else { return existing }
            return SupplyItem(
                id: existing.id,
                name: existing.name,
                quantity: action.previousQuantity,
                unit: action.previousUnit,
                domain: existing.domain,
                isPurchased: action.previousPurchased
            )
        }
        list = SupplyList(id: current.id, name: current.name, items: updatedItems)
        undoBuffer.clear()
        guard online else { return }
        do {
            _ = try await api.updateSupplyItem(
                action.itemId,
                quantity: action.previousQuantity,
                unit: action.previousUnit,
                isPurchased: action.previousPurchased
            )
            Haptics.light()
        } catch {
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
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

struct SupplyUndoAction: Sendable {
    let itemId: String
    let previousPurchased: Bool
    let previousQuantity: Double
    let previousUnit: String
}

struct SupplyView: View {
    @Environment(AppEnvironment.self) private var env
    var onOpenSettings: () -> Void = {}
    @State private var model = SupplyViewModel()
    @State private var showingOptions = false
    @State private var showingFilters = false
    @State private var checkOffItem: SupplyItem?
    @State private var supplyShareURL: String?
    @State private var supplyShareExpiresAt: String?
    @State private var isLoadingShare = false
    @State private var snoozeItem: SupplyItem?
    @State private var showingPaywall = false
    @State private var hasTriggeredAutoSync = false

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
                    countChip: model.totalCount > 0 ? model.totalCount : nil,
                    onOptions: { showingOptions = true },
                    onOpenSettings: onOpenSettings
                )
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
            .sheet(item: $checkOffItem) { item in
                SupplyItemCheckOffSheet(item: item) { quantity, unit in
                    await model.markPurchased(
                        item,
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
            .overlay(alignment: .bottom) {
                if model.undoBuffer.isShowing {
                    UndoToast(
                        message: "Item checked off",
                        onUndo: { Task { await undoSupplyCheckoff() } },
                        onDismiss: { model.undoBuffer.clear() }
                    )
                    .padding(.bottom, 80)
                } else if let message = model.dockMessage {
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
                        accessibilityLabel: "Dock purchased items to Cargo",
                        disabled: model.isDocking || model.purchasedCount == 0
                    ) {
                        Button {
                            Task {
                                await model.dock(
                                    api: env.api,
                                    snapshots: env.snapshots,
                                    online: env.network.isOnline,
                                    organizationId: organizationId
                                )
                            }
                        } label: {
                            Label("Dock to Cargo", systemImage: "shippingbox")
                        }
                        .disabled(model.isDocking || model.purchasedCount == 0)
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
                        checkOffItem = item
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

    private func undoSupplyCheckoff() async {
        guard let action = model.undoBuffer.pendingItem,
              env.network.isOnline
        else {
            model.undoBuffer.clear()
            return
        }
        await model.undoCheckoff(
            action,
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId
        )
    }
}

extension SupplyItem: Hashable {
    static func == (lhs: SupplyItem, rhs: SupplyItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
