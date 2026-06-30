import SwiftUI

struct CargoListView: View {
    @Environment(AppEnvironment.self) private var env
    var onScan: () -> Void = {}
    var onOpenSettings: () -> Void = {}
    @State private var model = CargoViewModel()
    @State private var showingAdd = false
    @State private var showingFilters = false

    private var organizationId: String {
        env.session.activeOrganizationId ?? "unknown"
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
            .onSubmit(of: .search) { Task { await reload() } }
            .onChange(of: model.filters.domain) { _, _ in model.applyClientFilters() }
            .onChange(of: model.filters.tag) { _, _ in model.applyClientFilters() }
            .background(Theme.ceramic)
            .toolbar {
                GlobalPageToolbar(
                    hasActiveFilters: model.filters.hasActiveFilters,
                    syncDomain: SnapshotDomain.cargo,
                    organizationId: organizationId,
                    onOptions: { showingFilters = true },
                    onOpenSettings: onOpenSettings
                )
            }
            .sheet(isPresented: $showingAdd) {
                AddCargoView { await reload() }
            }
            .sheet(isPresented: $showingFilters) {
                FilterOptionsSheet(filters: model.filters, availableTags: model.availableTags)
            }
            .safeAreaInset(edge: .bottom) {
                IconFAB(systemImage: "plus.circle.fill", accessibilityLabel: "Cargo actions") {
                    Button(action: onScan) {
                        Label("Scan receipt", systemImage: "camera.viewfinder")
                    }
                    Button { showingAdd = true } label: {
                        Label("Add item", systemImage: "plus")
                    }
                }
            }
        }
        .task(id: organizationId) {
            if isEmpty { await reload() }
        }
    }

    private func reload() async {
        await model.reload(
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId
        )
    }

    private var isEmpty: Bool {
        switch model.listContent {
        case let .inventory(items): items.isEmpty
        case let .search(results): results.isEmpty
        }
    }

    private var list: some View {
        List {
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
                            CargoRow(item: item)
                        }
                        .listRowBackground(Theme.surface)
                        .task { await model.loadMoreIfNeeded(current: item, api: env.api) }
                        .swipeActions {
                            Button(role: .destructive) {
                                Task { await model.delete(item, api: env.api) }
                            } label: { Label("Delete", systemImage: "trash") }
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
                    }
                }
            } header: {
                Text("\(model.total) items").rationCaption()
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .refreshable { await reload() }
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
            Text("\(result.quantity.formatted()) \(result.unit)")
                .font(Typography.caption())
                .foregroundStyle(Theme.carbon)
        }
        .padding(.vertical, 4)
    }
}

struct CargoRow: View {
    let item: CargoItem

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(item.name.capitalized).rationBody()
                if let expiresAt = item.expiresAt {
                    Text("Expires \(expiresAt.formatted(date: .abbreviated, time: .omitted))")
                        .rationCaption()
                        .foregroundStyle(expiresAt < Date() ? Theme.danger : Theme.muted)
                }
            }
            Spacer()
            Text("\(item.quantity.formatted()) \(item.unit)")
                .font(Typography.caption())
                .foregroundStyle(Theme.carbon)
        }
        .padding(.vertical, 4)
    }
}
