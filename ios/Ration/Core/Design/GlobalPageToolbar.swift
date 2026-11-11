import SwiftUI

/// Standard page toolbar: photo, accessories, and gear leading; sync, filters, and Hub trailing.
struct GlobalPageToolbar: ToolbarContent {
    var hasActiveFilters: Bool = false
    var syncDomain: String?
    var organizationId: String?
    /// When set, sync metadata is read from the private user+org snapshot scope.
    var syncUserId: String? = nil
    var isRefreshing: Bool = false
    var onOptions: (() -> Void)?
    var accessories: [PageCapsuleAccessory] = []
    /// Hub is absent on the Hub page and whenever the Fuel page flag is off.
    var showsHubButton: Bool = true
    var onOpenSettings: () -> Void
    @Environment(AppEnvironment.self) private var env

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            OrgSwitcherBar(accessories: accessories, onSettings: onOpenSettings)
        }
        ToolbarItem(placement: .topBarTrailing) {
            HStack(spacing: 12) {
                if isRefreshing {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityLabel("Refreshing")
                }
                if let syncDomain, let organizationId {
                    let state = env.snapshots.syncState(
                        domain: syncDomain,
                        organizationId: organizationId,
                        userId: syncUserId,
                        online: env.network.isOnline
                    )
                    let showStale = SyncIndicatorPolicy.shouldShowStaleDisclosure(
                        state: state,
                        isRefreshing: isRefreshing,
                        isInForegroundGrace: env.lifecycle.isInForegroundGrace,
                        lastRefreshFailed: env.refreshOutcomes.lastRefreshFailed(
                            organizationId: organizationId,
                            domain: syncDomain
                        )
                    )
                    if showStale || (state.shouldShowIndicator && !isStaleState(state)) {
                        SyncIndicatorIcon(state: state)
                    }
                }
                if let onOptions {
                    PageOptionsButton(hasActiveFilters: hasActiveFilters, action: onOptions)
                }
                if showsHubButton, env.session.clientFlags.isNutritionFuelPageEnabled {
                    Button {
                        env.openHubCover()
                    } label: {
                        Image(systemName: "square.grid.2x2")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("Hub")
                }
            }
        }
    }
}

struct PageOptionsButton: View {
    let hasActiveFilters: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .foregroundStyle(hasActiveFilters ? Theme.hyperGreen : Theme.carbon)
                .overlay {
                    if hasActiveFilters {
                        Circle()
                            .stroke(Theme.hyperGreen, lineWidth: 1.5)
                            .padding(-4)
                    }
                }
        }
        .accessibilityLabel("Filters and options")
        .accessibilityValue(hasActiveFilters ? "Active filters applied" : "No active filters")
    }
}

private func isStaleState(_ state: DataSyncState) -> Bool {
    if case .stale = state { return true }
    return false
}
