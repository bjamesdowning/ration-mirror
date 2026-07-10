import SwiftUI

enum DataSyncState: Equatable {
    case fresh
    case stale(Date)
    case offline(Date?)
    case neverSynced

    var shouldShowIndicator: Bool {
        switch self {
        case .fresh: false
        case .stale, .offline, .neverSynced: true
        }
    }

    var systemImage: String {
        switch self {
        case .fresh: "icloud.fill"
        case .stale: "icloud"
        case .offline: "icloud.slash"
        case .neverSynced: "icloud.slash"
        }
    }

    var accessibilityLabel: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        switch self {
        case .fresh:
            return "Data is up to date"
        case let .stale(date):
            let relative = formatter.localizedString(for: date, relativeTo: Date())
            return "Data from \(relative)"
        case let .offline(date):
            if let date {
                let relative = formatter.localizedString(for: date, relativeTo: Date())
                return "Offline. Last updated \(relative)"
            }
            return "Offline. No cached data"
        case .neverSynced:
            return "Not synced yet"
        }
    }
}

enum SyncIndicatorPolicy {
    static let staleThreshold: TimeInterval = 30 * 60
}

extension SnapshotStore {
    func syncState(domain: String, organizationId: String, online: Bool) -> DataSyncState {
        guard let syncedAt = syncedAt(domain: domain, organizationId: organizationId) else {
            return online ? .neverSynced : .offline(nil)
        }
        if !online {
            return .offline(syncedAt)
        }
        if Date().timeIntervalSince(syncedAt) > SyncIndicatorPolicy.staleThreshold {
            return .stale(syncedAt)
        }
        return .fresh
    }
}

struct SyncIndicatorIcon: View {
    let state: DataSyncState

    var body: some View {
        Image(systemName: state.systemImage)
            .foregroundStyle(iconColor)
            .accessibilityLabel(state.accessibilityLabel)
    }

    private var iconColor: Color {
        switch state {
        case .fresh: Theme.muted
        case .stale: Theme.warning
        case .offline, .neverSynced: Theme.muted
        }
    }
}

struct SyncIndicatorToolbar: ToolbarContent {
    let domain: String
    let organizationId: String
    var isRefreshing: Bool = false
    @Environment(AppEnvironment.self) private var env

    var body: some ToolbarContent {
        let state = env.snapshots.syncState(
            domain: domain,
            organizationId: organizationId,
            online: env.network.isOnline
        )
        ToolbarItem(placement: .topBarTrailing) {
            HStack(spacing: 8) {
                if isRefreshing {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityLabel("Refreshing")
                }
                if state.shouldShowIndicator {
                    SyncIndicatorIcon(state: state)
                }
            }
        }
    }
}

struct StaleDataBanner: View {
    let syncedAt: Date

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "clock.arrow.circlepath")
            Text(message)
                .rationCaption()
        }
        .foregroundStyle(Theme.carbon)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .padding(.horizontal, 12)
        .background(Theme.warning.opacity(0.18))
        .accessibilityLabel(message)
    }

    private var message: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        let relative = formatter.localizedString(for: syncedAt, relativeTo: Date())
        return "Showing cached data from \(relative) — pull to refresh"
    }
}

struct DataSyncBannerModifier: ViewModifier {
    let domain: String
    let organizationId: String?
    let reservesOfflineBannerSpace: Bool
    @Environment(AppEnvironment.self) private var env

    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .top, spacing: 0) {
            TimelineView(.periodic(from: Date(), by: 60)) { _ in
                if let organizationId, env.network.isOnline {
                    let state = env.snapshots.syncState(
                        domain: domain,
                        organizationId: organizationId,
                        online: true
                    )
                    if case let .stale(date) = state {
                        StaleDataBanner(syncedAt: date)
                            .padding(.top, reservesOfflineBannerSpace ? 36 : 0)
                    }
                }
            }
        }
    }
}

extension View {
    func dataSyncBanner(
        domain: String,
        organizationId: String?,
        reservesOfflineBannerSpace: Bool = false
    ) -> some View {
        modifier(DataSyncBannerModifier(
            domain: domain,
            organizationId: organizationId,
            reservesOfflineBannerSpace: reservesOfflineBannerSpace
        ))
    }
}
