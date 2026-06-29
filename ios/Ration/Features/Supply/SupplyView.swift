import SwiftUI
import Observation

@MainActor
@Observable
final class SupplyViewModel {
    private(set) var list: SupplyList?
    private(set) var isLoading = false
    private(set) var isSyncing = false
    private(set) var isDocking = false
    var errorMessage: String?
    var staleLabel: String?
    var dockMessage: String?
    private var lastHapticMilestone = 0

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
        staleLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.supply, organizationId: organizationId)
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
}

private extension SupplyItem {
    func withPurchased(_ value: Bool) -> SupplyItem {
        SupplyItem(id: id, name: name, quantity: quantity, unit: unit, domain: domain, isPurchased: value)
    }
}

struct SupplyView: View {
    @Environment(AppEnvironment.self) private var env
    var onOpenSettings: () -> Void = {}
    @State private var model = SupplyViewModel()
    @State private var showingOptions = false
    @State private var showingFilters = false
    @State private var checkOffItem: SupplyItem?
    @State private var supplyShareURL: String?
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
                    onOptions: { showingOptions = true },
                    onOpenSettings: onOpenSettings
                )
            }
            .background(Theme.ceramic)
            .sheet(isPresented: $showingOptions) {
                SupplyOptionsSheet(
                    shareURL: supplyShareURL,
                    isSyncing: model.isSyncing,
                    onRefreshFromMeals: {
                        await model.sync(api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                    },
                    onShare: { await createSupplyShare() },
                    onRevokeShare: { await revokeSupplyShare() },
                    onOpenFilters: {
                        showingOptions = false
                        showingFilters = true
                    }
                )
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
            .sheet(isPresented: $showingPaywall) { PaywallView() }
            .safeAreaInset(edge: .bottom) {
                if model.totalCount > 0 {
                    progressFooter
                }
            }
        }
        .task(id: organizationId) {
            await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
            if let mode = try? await env.api.settings().settings.supplyUnitMode {
                model.filters.supplyUnitMode = mode
            }
            supplyShareURL = try? await env.api.supplyShareStatus().shareUrl
            if env.network.isOnline, !hasTriggeredAutoSync {
                hasTriggeredAutoSync = true
                await model.sync(api: env.api, snapshots: env.snapshots, online: true, organizationId: organizationId)
            }
        }
    }

    private var progressFooter: some View {
        VStack(spacing: 12) {
            if let message = model.dockMessage {
                Text(message).rationCaption().foregroundStyle(Theme.hyperGreen)
            }
            HStack(spacing: 16) {
                ZStack {
                    Circle()
                        .stroke(Theme.platinum, lineWidth: 6)
                    Circle()
                        .trim(from: 0, to: model.progressFraction)
                        .stroke(Theme.hyperGreen, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(model.purchasedCount)/\(model.totalCount)")
                        .rationCaption()
                }
                .frame(width: 56, height: 56)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Shopping progress").rationHeadline()
                    Text("\(model.purchasedCount) of \(model.totalCount) purchased").rationCaption()
                }
                Spacer()
            }
            Button(model.isDocking ? "Docking…" : "Dock to Cargo") {
                Task {
                    await model.dock(api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                }
            }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(model.isDocking || model.purchasedCount == 0)
        }
        .padding()
        .background(Theme.surface)
    }

    private func listView(_ list: SupplyList) -> some View {
        List {
            if let staleLabel = model.staleLabel {
                Text(staleLabel).rationCaption().listRowBackground(Color.clear)
            }
            if let errorMessage = model.errorMessage {
                ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
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
            await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
        }
    }

    private func createSupplyShare() async {
        do {
            let response = try await env.api.createSupplyShare()
            supplyShareURL = response.shareUrl
            Haptics.success()
        } catch let error as APIError {
            if case .server(let status, _, _) = error, status == 403 {
                showingPaywall = true
            }
        } catch {}
    }

    private func revokeSupplyShare() async {
        _ = try? await env.api.revokeSupplyShare()
        supplyShareURL = nil
        Haptics.light()
    }
}

extension SupplyItem: Hashable {
    static func == (lhs: SupplyItem, rhs: SupplyItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
