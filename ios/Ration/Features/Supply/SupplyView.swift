import SwiftUI
import UIKit
import Observation

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
    @Environment(CopilotScrollContext.self) private var scrollContext
    var isTabActive: Bool = false
    var onOpenSettings: () -> Void = {}
    var onOpenGroupSettings: () -> Void = {}
    @State private var model = SupplyViewModel()
    @State private var showingOptions = false
    @State private var showingFilters = false
    @State private var checkOffItem: CheckOffPresentationItem?
    @State private var supplyWindow: SupplyPlanningWindow?
    @State private var snoozeItem: SupplyItem?
    @State private var paywallContext: PaywallContext?
    @State private var showingQuickAdd = false
    @State private var showingLists = false
    @State private var showingNewList = false
    @State private var showingRename = false
    @State private var renameText = ""
    @State private var showingDeleteConfirm = false
    @State private var showingDockConfirm = false
    @State private var choosingForLive = false
    @State private var selectedForLive: Set<String> = []
    @State private var hasTriggeredAutoSync = false
    @State private var showingReplenishReceipt = false
    @State private var showingSupplyScanCamera = false
    @State private var showingSupplyScanPhotoLibrary = false
    @State private var supplyScanReviewContext: SupplyScanReviewContext?
    @State private var scanConsent = AIConsentCoordinator()

    private var scanCreditCost: Int {
        env.session.session?.aiCosts?.scan ?? 1
    }

    private var organizationId: String? {
        env.session.activeOrganizationId
    }

    private var loadTaskKey: String {
        "\(organizationId ?? "nil")-\(isTabActive)-\(env.lifecycle.refreshToken(forTab: .supply))"
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.list == nil {
                    LoadingView()
                } else if let list = model.list, (model.totalCount > 0 || model.filters.hasActiveFilters), let organizationId {
                    listView(list, organizationId: organizationId)
                } else {
                    CopilotTrackableScrollSurface(
                        tab: .supply,
                        isActive: isTabActive,
                        hasTabAction: true
                    ) {
                        VStack(spacing: 16) {
                            EmptyStateView(
                                icon: "cart",
                                title: "No supply delta yet",
                                message: "Add items manually, select meals in Galley, mark Cargo for restock, or plan meals in Manifest."
                            )
                            Button("Add items") {
                                showingQuickAdd = true
                            }
                            .buttonStyle(PrimaryButtonStyle())
                            .disabled(!env.network.isOnline)
                            Button("Refresh list") {
                                Task {
                                    guard let organizationId else { return }
                                    model.refreshOutcomes = env.refreshOutcomes
                                    await model.sync(
                                        api: env.api,
                                        snapshots: env.snapshots,
                                        online: env.network.isOnline,
                                        organizationId: organizationId
                                    )
                                }
                            }
                            .buttonStyle(SecondaryButtonStyle())
                            .disabled(model.isSyncing)
                        }
                        .padding(24)
                    }
                }
            }
            .navigationTitle(model.isLiveList ? "Supply" : (model.list?.name ?? "Supply"))
            .toolbar {
                GlobalPageToolbar(
                    hasActiveFilters: model.filters.hasActiveFilters,
                    syncDomain: SnapshotDomain.supply,
                    organizationId: organizationId,
                    isRefreshing: model.isRefreshing,
                    onOptions: { showingOptions = true },
                    onOpenGroupSettings: onOpenGroupSettings,
                    onOpenSettings: onOpenSettings
                )
            }
            .background(Theme.ceramic)
            .safeAreaInset(edge: .top, spacing: 0) {
                if model.filters.domain != nil {
                    ActiveFilterChipRail(
                        domain: model.filters.domain,
                        onClearDomain: { model.filters.domain = nil }
                    )
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.ceramic)
                }
            }
            .dataSyncBanner(
                domain: SnapshotDomain.supply,
                organizationId: organizationId,
                isRefreshing: model.isRefreshing || model.isSyncing
            )
            .sheet(isPresented: $showingOptions) {
                SupplyOptionsSheet(
                    shareURL: model.share.shareURL,
                    shareExpiresAt: model.share.shareExpiresAt,
                    isLoadingShare: model.share.isLoading,
                    isSyncing: model.isSyncing,
                    canManageSupplySettings: env.session.activeOrg?.canManageSupplySettings == true,
                    supplyWindow: supplyWindow,
                    onRefreshFromMeals: {
                        guard let organizationId else { return }
                        model.refreshOutcomes = env.refreshOutcomes
                        await model.sync(
                            api: env.api,
                            snapshots: env.snapshots,
                            online: env.network.isOnline,
                            organizationId: organizationId
                        )
                    },
                    onShare: { await createSupplyShare() },
                    onRevokeShare: { await revokeSupplyShare() },
                    onUpgradeRequired: { paywallContext = PaywallContext(trigger: .featureGate, resource: "share") },
                    onOpenFilters: {
                        showingOptions = false
                        showingFilters = true
                    },
                    onPatchHorizon: { days in
                        guard env.network.isOnline else { return }
                        do {
                            let response = try await env.api.patchOrganizationSupplySettings(
                                manifestHorizonDays: days
                            )
                            supplyWindow = response.window
                            Haptics.success()
                        } catch {
                            model.errorMessage = (error as? APIError)?.errorDescription
                                ?? error.localizedDescription
                        }
                    }
                )
                .task {
                    model.share.loadStatus { try await env.api.supplyShareStatus() }
                    await loadSupplySettings()
                }
                .onDisappear { model.share.cancel() }
            }
            .sheet(isPresented: $showingFilters) {
                FilterOptionsSheet(
                    filters: model.filters,
                    onApplySupplyUnitMode: { mode in
                        Task {
                            let displayMode = UnitDisplayMode(rawValue: mode) ?? .metric
                            env.unitDisplayMode.apply(displayMode)
                            do {
                                let response = try await env.api.patchSettings(
                                    env.unitDisplayMode.settingsPatch(for: displayMode)
                                )
                                env.launch.updateUserSettings(response.settings)
                            } catch {
                                // Preference already applied locally; server sync best-effort
                            }
                        }
                    }
                )
            }
            .sheet(item: $checkOffItem) { presentation in
                SupplyItemCheckOffSheet(item: presentation.item) { quantity, unit in
                    guard let organizationId else { return }
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
                    guard let organizationId else { return }
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
            .sheet(item: $paywallContext) { ctx in
                PaywallView(context: ctx)
            }
            .onChange(of: model.paywallContext) { _, ctx in
                if let ctx { paywallContext = ctx }
            }
            .sheet(isPresented: $showingQuickAdd) {
                SupplyQuickAddSheet(listName: model.isLiveList ? "Supply" : (model.list?.name.capitalized ?? "list")) { text in
                    guard let organizationId else { return false }
                    return await model.addQuickItems(
                        text: text,
                        api: env.api,
                        snapshots: env.snapshots,
                        organizationId: organizationId
                    )
                }
            }
            .sheet(isPresented: $showingLists) {
                SupplyListsSheet(
                    catalog: model.catalog,
                    selectedId: model.list?.id
                ) { summary in
                    choosingForLive = false
                    selectedForLive = []
                    guard let organizationId else { return }
                    Task {
                        await model.selectList(
                            summary,
                            api: env.api,
                            snapshots: env.snapshots,
                            organizationId: organizationId
                        )
                    }
                } onNewList: {
                    showingNewList = true
                }
            }
            .sheet(isPresented: $showingNewList) {
                SupplyNewListSheet { name, text in
                    guard let organizationId else { return false }
                    return await model.createSavedList(
                        name: name,
                        itemText: text,
                        api: env.api,
                        snapshots: env.snapshots,
                        organizationId: organizationId
                    )
                }
            }
            .alert("Rename list", isPresented: $showingRename) {
                TextField("Name", text: $renameText)
                Button("Save") {
                    let name = renameText
                    Task {
                        guard let organizationId else { return }
                        _ = await model.renameCurrentList(
                            to: name,
                            api: env.api,
                            snapshots: env.snapshots,
                            organizationId: organizationId
                        )
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This only changes the list name. Items stay put.")
            }
            .confirmationDialog(
                "Delete this list?",
                isPresented: $showingDeleteConfirm,
                titleVisibility: .visible
            ) {
                Button("Delete list", role: .destructive) {
                    Task {
                        guard let organizationId else { return }
                        await model.deleteCurrentList(
                            api: env.api,
                            snapshots: env.snapshots,
                            organizationId: organizationId
                        )
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Items on this list are removed. Live Supply is not affected.")
            }
            .confirmationDialog(
                "Dock bought items to Cargo?",
                isPresented: $showingDockConfirm,
                titleVisibility: .visible
            ) {
                Button("Dock bought items") {
                    Task {
                        guard let organizationId else { return }
                        await model.dock(
                            api: env.api,
                            snapshots: env.snapshots,
                            online: env.network.isOnline,
                            organizationId: organizationId,
                            isCrewMember: env.session.isCrewMember
                        )
                        env.notifyCargoDataChanged()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Checked items move into Cargo and leave this list. Unchecked items stay, so a repeat list is not wiped.")
            }
            .sheet(isPresented: $showingReplenishReceipt) {
                ReplenishReceiptSheet(
                    creditCost: scanCreditCost,
                    onCamera: {
                        showingReplenishReceipt = false
                        scanConsent.presentIfNeeded(session: env.session) {
                            showingSupplyScanCamera = true
                        }
                    },
                    onPhotoLibrary: {
                        showingReplenishReceipt = false
                        scanConsent.presentIfNeeded(session: env.session) {
                            showingSupplyScanPhotoLibrary = true
                        }
                    },
                    onFile: { data, filename, mimeType in
                        showingReplenishReceipt = false
                        scanConsent.presentIfNeeded(session: env.session) {
                            Task { await runSupplyScan(data: data, filename: filename, mimeType: mimeType) }
                        }
                    }
                )
            }
            .sheet(item: $supplyScanReviewContext) { context in
                SupplyScanReviewView(context: context, catalog: model.catalog) {
                    Task {
                        guard let organizationId else { return }
                        model.refreshOutcomes = env.refreshOutcomes
                        await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.supply) {
                            await model.load(
                                api: env.api,
                                snapshots: env.snapshots,
                                online: env.network.isOnline,
                                organizationId: organizationId
                            )
                        }
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
            .fullScreenCover(isPresented: $showingSupplyScanCamera) {
                CameraPicker(sourceType: .camera) { image in
                    showingSupplyScanCamera = false
                    guard let image else { return }
                    Task { await runSupplyScan(image: image) }
                }
                .ignoresSafeArea()
            }
            .fullScreenCover(isPresented: $showingSupplyScanPhotoLibrary) {
                CameraPicker(sourceType: .photoLibrary) { image in
                    showingSupplyScanPhotoLibrary = false
                    guard let image else { return }
                    Task { await runSupplyScan(image: image) }
                }
                .ignoresSafeArea()
            }
            .fullScreenCover(isPresented: Binding(
                get: { model.isScanning },
                set: { _ in }
            )) {
                AIProcessingView(feature: .supplyReplenish, creditCost: scanCreditCost)
            }
            .overlay(alignment: .bottom) {
                if let message = model.dockMessage {
                    TransientSuccessToast(message: message) {
                        model.dockMessage = nil
                    }
                    .padding(
                        .bottom,
                        CopilotDockLayout.toastBottomOffset(
                            isExpanded: scrollContext.isExpanded,
                            keyboardInset: 0
                        )
                    )
                }
            }
        }
        .tabDockAction(tag: .supply) {
            IconFABMenuCore(
                systemImage: "plus.circle.fill",
                accessibilityLabel: "Supply actions",
                disabled: model.isDocking || model.isScanning || !env.network.isOnline
            ) {
                Button {
                    showingQuickAdd = true
                } label: {
                    Label("Add items", systemImage: "plus")
                }
                .disabled(!model.canEditCurrentList)
                if model.multiListsEnabled {
                    Button {
                        showingLists = true
                    } label: {
                        Label("Lists", systemImage: "list.bullet")
                    }
                    Button {
                        showingNewList = true
                    } label: {
                        Label("New list", systemImage: "square.and.pencil")
                    }
                    if !model.isLiveList {
                        Button {
                            renameText = model.list?.name ?? ""
                            showingRename = true
                        } label: {
                            Label("Rename list", systemImage: "pencil")
                        }
                        .disabled(model.activeListState == "archived")
                        Button(role: .destructive) {
                            showingDeleteConfirm = true
                        } label: {
                            Label("Delete list", systemImage: "trash")
                        }
                    }
                }
                if env.session.clientFlags.isAiDockFromReceiptEnabled {
                    Button {
                        showingReplenishReceipt = true
                    } label: {
                        Label("Dock from Receipt", systemImage: "camera.fill")
                    }
                }
                Button {
                    showingDockConfirm = true
                } label: {
                    Label("Dock bought items to Cargo", systemImage: "shippingbox.fill")
                }
                .disabled(model.purchasedCount == 0 || model.isDocking || !model.canEditCurrentList)
            }
        }
        .task(id: loadTaskKey) {
            guard isTabActive, let organizationId else { return }
            model.refreshOutcomes = env.refreshOutcomes
            model.multiListsEnabled = env.session.clientFlags.isSupplyMultiListsEnabled
            await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.supply) {
                await model.load(
                    api: env.api,
                    snapshots: env.snapshots,
                    online: env.network.isOnline,
                    organizationId: organizationId
                )
            }
            model.filters.supplyUnitMode = env.unitDisplayMode.mode.rawValue
            model.share.loadStatus { try await env.api.supplyShareStatus() }
            if env.network.isOnline, !hasTriggeredAutoSync, model.isLiveList {
                hasTriggeredAutoSync = true
                await model.sync(
                    api: env.api,
                    snapshots: env.snapshots,
                    online: true,
                    organizationId: organizationId
                )
            }
            while !Task.isCancelled && isTabActive && model.multiListsEnabled {
                try? await Task.sleep(nanoseconds: 12_000_000_000)
                guard !Task.isCancelled, isTabActive else { break }
                await model.pollCatalogIfVisible(api: env.api)
            }
        }
        .onDisappear { model.cancelActiveWork() }
    }

    private func listView(_ list: SupplyList, organizationId: String) -> some View {
        List {
            if model.remoteRevisionNotice {
                Section {
                    Button("List changed — refresh") {
                        Task {
                            model.remoteRevisionNotice = false
                            await model.load(
                                api: env.api,
                                snapshots: env.snapshots,
                                online: env.network.isOnline,
                                organizationId: organizationId
                            )
                        }
                    }
                }
            }
            if model.multiListsEnabled, !model.isLiveList {
                Section {
                    if choosingForLive {
                        Button(selectedForLive.isEmpty ? "Add selected to Live" : "Add \(selectedForLive.count) to Live") {
                            let ids = Array(selectedForLive)
                            choosingForLive = false
                            selectedForLive = []
                            Task { await model.addItemsToLive(itemIds: ids, api: env.api) }
                        }
                        .disabled(selectedForLive.isEmpty)
                        Button("Cancel") {
                            choosingForLive = false
                            selectedForLive = []
                        }
                    } else {
                        Button("Add all to Live") {
                            Task { await model.addItemsToLive(itemIds: nil, api: env.api) }
                        }
                        .disabled(model.totalCount == 0)
                        Button("Choose items") {
                            choosingForLive = true
                            selectedForLive = []
                        }
                        .disabled(model.totalCount == 0)
                    }
                } footer: {
                    Text("Copies onto Live Supply and leaves this list as-is. Check items off, then dock, when you shop this list itself.")
                        .textCase(nil)
                }
            }
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
            if let errorMessage = model.errorMessage ?? model.share.errorMessage {
                ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
            }
            SnoozedItemsSection(
                snoozes: model.snoozes,
                cargoLinkRows: model.cargoLinkRows
            ) { snooze in
                await model.unsnooze(
                    snooze,
                    api: env.api,
                    snapshots: env.snapshots,
                    online: env.network.isOnline,
                    organizationId: organizationId
                )
            }
            if model.showsFilteredEmptyState {
                Section {
                    EmptyStateView(
                        icon: "magnifyingglass",
                        title: "No matches",
                        message: "Try adjusting your filters or search."
                    )
                    .listRowBackground(Color.clear)
                }
            } else {
                ForEach(model.displayedItems) { item in
                    SupplyListItemRow(
                        item: item,
                        cargoLinkRows: model.cargoLinkRows,
                        onCheckOff: {
                            if item.isPurchased {
                                model.runMutation {
                                    await model.toggle(item, api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                                }
                            } else {
                                checkOffItem = CheckOffPresentationItem(item: item)
                            }
                        },
                        onCheck: {
                            model.runMutation {
                                await model.toggle(item, api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                            }
                        },
                        onSnooze: { snoozeItem = item },
                        liveSelection: choosingForLive
                            ? (selectedForLive.contains(item.id), {
                                if selectedForLive.contains(item.id) {
                                    selectedForLive.remove(item.id)
                                } else {
                                    selectedForLive.insert(item.id)
                                }
                            })
                            : nil,
                        onDelete: {
                            model.runMutation {
                                await model.deleteItem(item, api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                            }
                        }
                    )
                    .listRowBackground(Theme.surface)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .refreshable {
            model.refreshOutcomes = env.refreshOutcomes
            if env.network.isOnline {
                await model.sync(
                    api: env.api,
                    snapshots: env.snapshots,
                    online: true,
                    organizationId: organizationId
                )
            } else {
                await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.supply) {
                    await model.load(
                        api: env.api,
                        snapshots: env.snapshots,
                        online: false,
                        organizationId: organizationId
                    )
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .copilotDockScrollMargins(
            hasTabAction: true
        )
        .copilotScrollTracked(tab: .supply, isActive: isTabActive)
    }

    private func loadSupplySettings() async {
        guard env.network.isOnline else { return }
        do {
            let response = try await env.api.organizationSupplySettings()
            supplyWindow = response.window
        } catch {
            // Non-fatal — options sheet falls back to defaults.
        }
    }

    private func createSupplyShare() async {
        if let ctx = await model.share.create(
            { try await env.api.createSupplyShare() },
            onForbidden: { ShareLinkController.paywallContext(from: $0, defaultResource: "share") }
        ) {
            paywallContext = ctx
        }
    }

    private func revokeSupplyShare() async {
        await model.share.revoke { try await env.api.revokeSupplyShare() }
    }

    private func runSupplyScan(image: UIImage) async {
        if let context = await model.scanReceiptAndFetchMatch(image: image, api: env.api) {
            supplyScanReviewContext = context
        }
    }

    private func runSupplyScan(data: Data, filename: String, mimeType: String) async {
        if let context = await model.scanFileAndFetchMatch(
            data: data,
            filename: filename,
            mimeType: mimeType,
            api: env.api
        ) {
            supplyScanReviewContext = context
        }
    }
}

private struct SupplyListItemRow: View {
    @Environment(AppEnvironment.self) private var env
    let item: SupplyItem
    let cargoLinkRows: [CargoLinkResolver.Row]
    let onCheckOff: () -> Void
    let onCheck: () -> Void
    let onSnooze: () -> Void
    var liveSelection: (selected: Bool, toggle: () -> Void)? = nil
    let onDelete: () -> Void
    @ScaledMetric(relativeTo: .body) private var checkIconPoints: CGFloat = 28

    var body: some View {
        HStack {
            Button(action: onCheckOff) {
                Image(systemName: item.isPurchased ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: checkIconPoints))
                    .foregroundStyle(item.isPurchased ? Theme.hyperGreen : Theme.muted)
                    .frame(width: checkIconPoints, height: checkIconPoints)
            }
            .buttonStyle(.plain)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityLabel(
                item.isPurchased
                    ? "Mark \(item.name) not purchased"
                    : "Check off \(item.name)"
            )

            VStack(alignment: .leading, spacing: 4) {
                supplyItemName
                if !item.resolvedSourceOrigins.isEmpty {
                    SupplyItemOriginBadge(origins: item.resolvedSourceOrigins)
                }
            }

            Spacer()

            DisplayQuantityLabel(
                quantity: item.quantity,
                unit: item.unit,
                baseQuantity: item.baseQuantity,
                baseUnit: item.baseUnit,
                ingredientName: item.name
            )
            .rationCaption()
            .accessibilityHidden(true)

            if let liveSelection {
                Button(action: liveSelection.toggle) {
                    Image(systemName: liveSelection.selected ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(liveSelection.selected ? Theme.hyperGreen : Theme.muted)
                }
                .buttonStyle(.plain)
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityLabel(liveSelection.selected ? "Remove \(item.name) from Live copy" : "Add \(item.name) to Live")
            }
        }
        .accessibilityElement(children: .contain)
        .swipeActions(edge: .leading) {
            if !item.isPurchased {
                Button(action: onCheck) {
                    Label("Check", systemImage: "checkmark")
                }
                .tint(Theme.hyperGreen)
            }
        }
        .swipeActions {
            if !item.isPurchased {
                Button(action: onSnooze) {
                    Label("Snooze", systemImage: "moon.zzz")
                }
                .tint(Theme.carbon.opacity(0.6))
            }
            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
            .destructiveDeleteTint()
        }
    }

    @ViewBuilder
    private var supplyItemName: some View {
        if let cargoId = CargoLinkResolver.resolveCargoId(forName: item.name, in: cargoLinkRows),
           !item.isPurchased {
            Button {
                env.openDeepLink(.cargoItem(id: cargoId))
            } label: {
                Text(item.name.capitalized)
                    .rationBody()
                    .foregroundStyle(Theme.carbon)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(supplyNameAccessibilityLabel)
        } else {
            Text(item.name.capitalized)
                .rationBody()
                .strikethrough(item.isPurchased)
                .foregroundStyle(item.isPurchased ? Theme.muted : Theme.carbon)
                .accessibilityLabel(supplyNameAccessibilityLabel)
        }
    }

    private var supplyNameAccessibilityLabel: String {
        let quantity = QuantityPresenter.present(
            quantity: item.quantity,
            unit: item.unit,
            ingredientName: item.name,
            mode: .original
        )
        return "\(item.name.capitalized), \(quantity)"
    }
}
