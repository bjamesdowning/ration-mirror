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

    var purchasedCount: Int {
        list?.items.filter(\.isPurchased).count ?? 0
    }

    var totalCount: Int {
        list?.items.count ?? 0
    }

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if online {
            do {
                list = try await api.supply().list
                if let list {
                    snapshots.save(SupplyResponse(list: list), domain: SnapshotDomain.supply, organizationId: nil)
                }
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                restoreSnapshot(snapshots)
            }
        } else {
            restoreSnapshot(snapshots)
        }
        staleLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.supply)
    }

    private func restoreSnapshot(_ snapshots: SnapshotStore) {
        if let cached = snapshots.load(SupplyResponse.self, domain: SnapshotDomain.supply) {
            list = cached.payload.list
        }
    }

    func toggle(_ item: SupplyItem, api: RationAPI, snapshots: SnapshotStore, online: Bool) async {
        guard let current = list else { return }
        let newValue = !item.isPurchased
        let updatedItems = current.items.map { existing in
            existing.id == item.id ? existing.withPurchased(newValue) : existing
        }
        list = SupplyList(id: current.id, name: current.name, items: updatedItems)
        if newValue { Haptics.light() }
        guard online else { return }
        do {
            _ = try await api.toggleSupplyItem(item.id, isPurchased: newValue)
        } catch {
            await load(api: api, snapshots: snapshots, online: online)
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func sync(api: RationAPI, snapshots: SnapshotStore, online: Bool) async {
        guard online else {
            errorMessage = "Supply sync requires a network connection."
            return
        }
        isSyncing = true
        defer { isSyncing = false }
        do {
            let response = try await api.syncSupply()
            list = response.list
            snapshots.save(SupplyResponse(list: response.list), domain: SnapshotDomain.supply, organizationId: nil)
            Haptics.success()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func dock(api: RationAPI, snapshots: SnapshotStore, online: Bool) async {
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
            await load(api: api, snapshots: snapshots, online: online)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    var dockMessage: String?
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
                            message: "Select meals in Galley and sync Supply to build your shopping list."
                        )
                        Button("Sync from meals") {
                            Task {
                                await model.sync(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
                            }
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(model.isSyncing)
                    }
                    .padding(24)
                }
            }
            .navigationTitle("Supply")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(model.isSyncing ? "Syncing…" : "Sync") {
                        Task {
                            await model.sync(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
                        }
                    }
                    .disabled(model.isSyncing)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    ProfileToolbarButton(action: onOpenSettings)
                }
            }
            .background(Theme.ceramic)
            .safeAreaInset(edge: .bottom) {
                if model.totalCount > 0 {
                    progressFooter
                }
            }
        }
        .task {
            await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
        }
    }

    private var progressFooter: some View {
        VStack(spacing: 8) {
            if let message = model.dockMessage {
                Text(message).rationCaption().foregroundStyle(Theme.hyperGreen)
            }
            HStack {
                Text("\(model.purchasedCount)/\(model.totalCount) purchased")
                    .rationCaption()
                Spacer()
                Button(model.isDocking ? "Docking…" : "Dock to Cargo") {
                    Task {
                        await model.dock(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
                    }
                }
                .font(Typography.headline())
                .foregroundStyle(Theme.hyperGreen)
                .disabled(model.isDocking || model.purchasedCount == 0)
            }
            ProgressView(value: Double(model.purchasedCount), total: Double(max(model.totalCount, 1)))
                .tint(Theme.hyperGreen)
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
            ForEach(list.items) { item in
                Button {
                    Task {
                        await model.toggle(item, api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
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
                .accessibilityLabel("\(item.name), \(item.isPurchased ? "purchased" : "not purchased")")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .refreshable {
            await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
        }
    }
}
