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

    func load(api: RationAPI) async {
        do {
            let data = try await api.dashboard()
            state = .loaded(data)
        } catch {
            state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }
}

struct DashboardView: View {
    @Environment(AppEnvironment.self) private var env
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
                        Button("Retry") { Task { await model.load(api: env.api) } }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(24)
                case let .loaded(data):
                    content(data)
                }
            }
            .navigationTitle("Hub")
            .background(Theme.ceramic)
        }
        .task { await model.load(api: env.api) }
        .refreshable { await model.load(api: env.api) }
    }

    private func content(_ data: DashboardResponse) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                tierBanner(data)

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
