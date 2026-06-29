import SwiftUI
import Observation

@MainActor
@Observable
final class DashboardViewModel {
    enum State {
        case loading
        case loaded(DashboardResponse)
        case failed(String)
    }

    private(set) var state: State = .loading
    var staleLabel: String?

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool) async {
        if online {
            do {
                let data = try await api.dashboard()
                state = .loaded(data)
                snapshots.save(data, domain: SnapshotDomain.dashboard, organizationId: nil)
            } catch {
                if restoreSnapshot(snapshots) {
                    state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                } else {
                    state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                }
            }
        } else if restoreSnapshot(snapshots) {
            // offline snapshot
        } else {
            state = .failed("You're offline and no cached Hub data is available.")
        }
        staleLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.dashboard)
    }

    @discardableResult
    private func restoreSnapshot(_ snapshots: SnapshotStore) -> Bool {
        guard let cached = snapshots.load(DashboardResponse.self, domain: SnapshotDomain.dashboard) else {
            return false
        }
        state = .loaded(cached.payload)
        return true
    }

    var nextAction: (title: String, detail: String, icon: String)? {
        guard case let .loaded(data) = state else { return nil }
        if data.cargo.expiringCount > 0 {
            return ("Use expiring cargo", "\(data.cargo.expiringCount) items expiring soon", "clock.badge.exclamationmark")
        }
        if data.supply.uncheckedItems > 0 {
            return ("Finish supply run", "\(data.supply.uncheckedItems) items to buy", "cart")
        }
        if data.cargo.expiredCount > 0 {
            return ("Clear expired cargo", "\(data.cargo.expiredCount) expired items", "xmark.bin")
        }
        if data.meals.total == 0 {
            return ("Stock Galley", "Add your first meal", "fork.knife")
        }
        return ("Scan receipt", "Add cargo from a receipt", "camera.viewfinder")
    }
}

struct DashboardView: View {
    @Environment(AppEnvironment.self) private var env
    var onScan: () -> Void = {}
    var onOpenSettings: () -> Void = {}
    @State private var model = DashboardViewModel()

    var body: some View {
        NavigationStack {
            Group {
                switch model.state {
                case .loading:
                    LoadingView()
                case let .failed(message):
                    VStack(spacing: 16) {
                        ErrorBanner(message: message)
                        Button("Retry") {
                            Task {
                                await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
                            }
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(24)
                case let .loaded(data):
                    content(data)
                }
            }
            .navigationTitle("Hub")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack {
                        Button(action: onScan) {
                            Image(systemName: "camera.viewfinder")
                        }
                        .accessibilityLabel("Scan receipt")
                        ProfileToolbarButton(action: onOpenSettings)
                    }
                }
            }
            .background(Theme.ceramic)
        }
        .task {
            await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
        }
        .refreshable {
            await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
        }
    }

    private func content(_ data: DashboardResponse) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                if let staleLabel = model.staleLabel {
                    Text(staleLabel).rationCaption().frame(maxWidth: .infinity, alignment: .leading)
                }

                tierBanner(data)

                if let action = model.nextAction {
                    GlassCard {
                        HStack(spacing: 12) {
                            Image(systemName: action.icon)
                                .font(.title2)
                                .foregroundStyle(Theme.hyperGreen)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Next action").rationCaption()
                                Text(action.title).rationHeadline()
                                Text(action.detail).rationCaption()
                            }
                            Spacer()
                        }
                    }
                    .accessibilityElement(children: .combine)
                }

                loopStrip

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    StatCard(title: "Cargo", value: "\(data.cargo.totalItems)", icon: "shippingbox", tint: Theme.carbon)
                    StatCard(title: "Expiring", value: "\(data.cargo.expiringCount)", icon: "clock.badge.exclamationmark", tint: Theme.warning)
                    StatCard(title: "Expired", value: "\(data.cargo.expiredCount)", icon: "xmark.bin", tint: Theme.danger)
                    StatCard(title: "Meals", value: "\(data.meals.total)", icon: "fork.knife", tint: Theme.carbon)
                }

                GlassCard {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Supply list").rationHeadline()
                            Text("\(data.supply.uncheckedItems) of \(data.supply.totalItems) to buy")
                                .rationCaption()
                        }
                        Spacer()
                        Image(systemName: "cart")
                            .foregroundStyle(Theme.hyperGreen)
                    }
                }
            }
            .padding(16)
        }
    }

    private var loopStrip: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Ration loop").rationHeadline()
                HStack {
                    loopStep("Cargo", icon: "shippingbox")
                    Image(systemName: "arrow.right").foregroundStyle(Theme.muted)
                    loopStep("Galley", icon: "fork.knife")
                    Image(systemName: "arrow.right").foregroundStyle(Theme.muted)
                    loopStep("Manifest", icon: "calendar")
                    Image(systemName: "arrow.right").foregroundStyle(Theme.muted)
                    loopStep("Supply", icon: "cart")
                }
                .font(Typography.caption())
            }
        }
    }

    private func loopStep(_ title: String, icon: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon).foregroundStyle(Theme.hyperGreen)
            Text(title)
        }
        .frame(maxWidth: .infinity)
    }

    private func tierBanner(_ data: DashboardResponse) -> some View {
        GlassCard {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(data.tier == "crew_member" && !data.isTierExpired ? "Crew Member" : "Free")
                        .rationTitle()
                    Text("\(data.credits) credits").rationCaption()
                }
                Spacer()
                Image(systemName: "bolt.fill")
                    .foregroundStyle(Theme.hyperGreen)
            }
        }
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let tint: Color

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon).foregroundStyle(tint)
                Text(value).font(Typography.display()).foregroundStyle(tint)
                Text(title).rationCaption()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
