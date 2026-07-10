import SwiftUI

struct CargoListView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(CopilotScrollContext.self) private var scrollContext
    var isTabActive: Bool = false
    var onScan: () -> Void = {}
    var onOpenSettings: () -> Void = {}
    @State private var model = CargoViewModel()
    @State private var showingAdd = false
    @State private var showingFilters = false
    @State private var editingItem: CargoItem?
    @State private var restockItem: CargoItem?
    @State private var showGroupSettings = false

    private var organizationId: String? {
        env.session.activeOrganizationId
    }

    private var loadTaskKey: String {
        "\(organizationId ?? "nil")-\(isTabActive)"
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && isEmpty {
                    LoadingView()
                } else if let errorMessage = model.errorMessage, isEmpty {
                    VStack(spacing: 16) {
                        ErrorBanner(message: errorMessage)
                        Button("Retry") { Task { await reload() } }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(24)
                } else if isEmpty {
                    VStack(spacing: 16) {
                        EmptyStateView(
                            icon: "shippingbox",
                            title: model.isSearchActive ? "No matches" : "No cargo yet",
                            message: model.isSearchActive
                                ? "Try a different search term."
                                : "Scan a receipt or add staples manually to fill your pantry."
                        )
                        if !model.isSearchActive {
                            Button("Scan receipt") { onScan() }
                                .buttonStyle(AIButtonStyle())
                            Button("Add manually") { showingAdd = true }
                                .buttonStyle(SecondaryButtonStyle())
                        }
                    }
                    .padding(24)
                } else {
                    list
                }
            }
            .navigationTitle("Cargo")
            .searchable(text: $model.filters.search, prompt: "Search cargo")
            .onSubmit(of: .search) { Task { await reload(forceRemoteSearch: true) } }
            .onChange(of: model.filters.search) { _, _ in model.applyClientFilters() }
            .onChange(of: model.filters.domain) { _, _ in model.applyClientFilters() }
            .onChange(of: model.filters.selectedTags) { _, _ in model.applyClientFilters() }
            .background(Theme.ceramic)
            .toolbar {
                GlobalPageToolbar(
                    hasActiveFilters: model.filters.hasActiveFilters,
                    syncDomain: SnapshotDomain.cargo,
                    organizationId: organizationId,
                    onOptions: { showingFilters = true },
                    onOpenGroupSettings: { showGroupSettings = true },
                    onOpenSettings: onOpenSettings
                )
            }
            .navigationDestination(isPresented: $showGroupSettings) {
                GroupSettingsView()
            }
            .sheet(isPresented: $showingAdd) {
                CargoFormView(mode: .create) {
                    await reload()
                    env.notifyCargoDataChanged()
                }
            }
            .sheet(isPresented: $showingFilters) {
                FilterOptionsSheet(filters: model.filters, availableTags: model.availableTags)
            }
            .sheet(item: $editingItem) { item in
                CargoFormView(mode: .edit(item)) {
                    await reload()
                    env.notifyCargoDataChanged()
                }
            }
            .sheet(item: $restockItem) { item in
                CargoRestockQuantitySheet(item: item) { quantity in
                    await model.toggleRestock(item, quantity: quantity, api: env.api)
                }
            }
        }
        .tabDockAction(tag: 1) {
            IconFABMenuCore(systemImage: "plus.circle.fill", accessibilityLabel: "Cargo actions") {
                Button(action: onScan) {
                    Label("Scan receipt", systemImage: "camera.viewfinder")
                }
                Button { showingAdd = true } label: {
                    Label("Add item", systemImage: "plus")
                }
            }
        }
        .task(id: loadTaskKey) {
            guard isTabActive, let organizationId else { return }
            if isEmpty { await reload(forceRemoteSearch: false, organizationId: organizationId) }
        }
    }

    private func reload(forceRemoteSearch: Bool = false, organizationId: String? = nil) async {
        guard let organizationId = organizationId ?? self.organizationId else { return }
        await model.reload(
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId,
            forceRemoteSearch: forceRemoteSearch
        )
    }

    private func resolveSearchCargoItem(_ result: SearchResult) async -> CargoItem? {
        if let cached = model.cachedCargoItem(id: result.id) {
            return cached
        }
        return await model.resolveCargoItem(for: result, api: env.api)
    }

    private func handleSearchSupplyToggle(_ result: SearchResult) async {
        guard let item = await resolveSearchCargoItem(result) else {
            if model.errorMessage == nil {
                model.errorMessage = "Couldn't load this item. Pull to refresh and try again."
            }
            return
        }
        if model.isCargoSelected(result.id) {
            await model.toggleRestock(item, api: env.api)
        } else {
            restockItem = item
        }
    }

    private func handleSearchEdit(_ result: SearchResult) async {
        guard let item = await resolveSearchCargoItem(result) else {
            if model.errorMessage == nil {
                model.errorMessage = "Couldn't load this item. Pull to refresh and try again."
            }
            return
        }
        editingItem = item
    }

    private var isEmpty: Bool {
        switch model.listContent {
        case let .inventory(items): items.isEmpty
        case let .search(results): results.isEmpty
        }
    }

    private var list: some View {
        List {
            if model.selectedCargoCount > 0 {
                Section {
                    SupplySelectionBar(
                        count: model.selectedCargoCount,
                        itemLabel: model.selectedCargoCount == 1 ? "item" : "items",
                        contextLabel: "for Supply restock",
                        isClearing: model.isClearingSelections
                    ) {
                        Task { await model.clearSelections(api: env.api) }
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if !model.isLoading {
                ListCountHeader(count: model.total)
            }
            if let errorMessage = model.errorMessage {
                ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
            }
            Section {
                switch model.listContent {
                case let .inventory(items):
                    ForEach(items) { item in
                        NavigationLink {
                            CargoDetailView(itemId: item.id)
                        } label: {
                            CargoRowView(
                                item: item,
                                isSelectedForRestock: model.isCargoSelected(item.id)
                            )
                        }
                        .listRowBackground(Theme.surface)
                        .task { await model.loadMoreIfNeeded(current: item, api: env.api) }
                        .inventoryLeadingSwipeActions(
                            isSelectedForSupply: model.isCargoSelected(item.id),
                            onSupplyToggle: {
                                if model.isCargoSelected(item.id) {
                                    Task { await model.toggleRestock(item, api: env.api) }
                                } else {
                                    restockItem = item
                                }
                            },
                            onEdit: { editingItem = item }
                        )
                        .inventoryDestructiveTrailingSwipe {
                            Task {
                                await model.delete(item, api: env.api)
                                env.notifyCargoDataChanged()
                            }
                        }
                    }
                case let .search(results):
                    ForEach(results) { result in
                        NavigationLink {
                            CargoDetailView(itemId: result.id)
                        } label: {
                            SearchResultRow(result: result)
                        }
                        .listRowBackground(Theme.surface)
                        .inventoryLeadingSwipeActions(
                            isSelectedForSupply: model.isCargoSelected(result.id),
                            onSupplyToggle: {
                                Task { await handleSearchSupplyToggle(result) }
                            },
                            onEdit: {
                                Task { await handleSearchEdit(result) }
                            }
                        )
                        .inventoryDestructiveTrailingSwipe {
                            Task {
                                await model.delete(id: result.id, api: env.api)
                                env.notifyCargoDataChanged()
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .refreshable { await reload() }
        .scrollDismissesKeyboard(.interactively)
        .copilotDockScrollMargins(isExpanded: scrollContext.isExpanded)
        .copilotDismissKeyboardOnTap()
        .copilotScrollTracked()
    }
}

struct SearchResultRow: View {
    let result: SearchResult

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(result.name.capitalized).rationBody()
                Text(result.domain.capitalized).rationCaption()
            }
            Spacer()
            DisplayQuantityLabel(
                quantity: result.quantity,
                unit: result.unit,
                baseQuantity: result.baseQuantity,
                baseUnit: result.baseUnit,
                ingredientName: result.name
            )
            .font(Typography.caption())
            .foregroundStyle(Theme.carbon)
        }
        .padding(.vertical, 4)
    }
}
