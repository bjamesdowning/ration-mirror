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
    /// Extra controls in the right pill, immediately left of Hub.
    var trailingAccessories: [PageCapsuleAccessory] = []
    var showsHubAvatar: Bool = false
    var isHubEditing: Bool = false
    var hubSaveInFlight: Bool = false
    var onEditHub: (() -> Void)? = nil
    var onFinishHubEdit: (() -> Void)? = nil
    var onOpenSettings: () -> Void
    @Environment(AppEnvironment.self) private var env

    private var showsHubDestination: Bool {
        showsHubButton && env.session.clientFlags.isNutritionFuelPageEnabled
    }

    private var hasTrailing: Bool {
        isRefreshing
            || (syncDomain != nil && organizationId != nil)
            || onOptions != nil
            || !trailingAccessories.isEmpty
            || showsHubDestination
            || showsHubAvatar
            || onEditHub != nil
            || isHubEditing
    }

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            OrgSwitcherBar(accessories: accessories, onSettings: onOpenSettings)
        }
        if hasTrailing {
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
                    ForEach(trailingAccessories) { accessory in
                        Button(action: accessory.action) {
                            Image(systemName: accessory.systemImage)
                                .frame(minWidth: 44, minHeight: 44)
                        }
                        .buttonStyle(.plain)
                        .disabled(!accessory.isEnabled)
                        .accessibilityLabel(accessory.label)
                        .accessibilityHint(accessory.hint ?? "")
                        .accessibilityValue(accessory.value ?? "")
                    }
                    if showsHubAvatar || onEditHub != nil || isHubEditing {
                        hubEditCluster
                    }
                    if showsHubDestination {
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

    @ViewBuilder
    private var hubEditCluster: some View {
        HStack(spacing: 0) {
            if showsHubAvatar, !isHubEditing {
                hubAvatar
            }
            if isHubEditing {
                Button {
                    onFinishHubEdit?()
                } label: {
                    Image(systemName: "checkmark")
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .disabled(hubSaveInFlight)
                .accessibilityLabel("Done")
                .accessibilityValue(hubSaveInFlight ? "Saving Hub layout" : "")
            } else if let onEditHub {
                Button(action: onEditHub) {
                    Image(systemName: "slider.horizontal.3")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Edit Hub layout")
            }
        }
    }

    private var hubAvatar: some View {
        let url = env.session.userImageURL
        return Group {
            if let url {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Image(systemName: "person.crop.circle.fill")
                }
            } else {
                Image(systemName: "person.crop.circle.fill")
            }
        }
        .frame(width: 28, height: 28)
        .clipShape(Circle())
        .accessibilityHidden(true)
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
