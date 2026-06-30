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
    @Environment(AppEnvironment.self) private var env

    var body: some ToolbarContent {
        let state = env.snapshots.syncState(
            domain: domain,
            organizationId: organizationId,
            online: env.network.isOnline
        )
        if state.shouldShowIndicator {
            ToolbarItem(placement: .topBarTrailing) {
                SyncIndicatorIcon(state: state)
            }
        }
    }
}
