import SwiftUI

struct CargoListView: View {
    @Environment(AppEnvironment.self) private var env
    var onScan: () -> Void = {}
    var onOpenSettings: () -> Void = {}
    @State private var model = CargoViewModel()
    @State private var showingAdd = false

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.items.isEmpty {
                    LoadingView()
                } else if let errorMessage = model.errorMessage, model.items.isEmpty {
                    VStack(spacing: 16) {
                        ErrorBanner(message: errorMessage)
                        Button("Retry") {
                            Task {
                                await model.reload(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
                            }
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(24)
                } else if model.items.isEmpty {
                    VStack(spacing: 16) {
                        EmptyStateView(
                            icon: "shippingbox",
                            title: "No cargo yet",
                            message: "Scan a receipt or add staples manually to fill your pantry."
                        )
                        Button("Scan receipt") { onScan() }
                            .buttonStyle(PrimaryButtonStyle())
                        Button("Add manually") { showingAdd = true }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(24)
                } else {
                    list
                }
            }
            .navigationTitle("Cargo")
            .searchable(text: $model.searchQuery, prompt: "Search cargo")
            .onSubmit(of: .search) {
                Task {
                    await model.reload(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
                }
            }
            .background(Theme.ceramic)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { filterMenu }
                ToolbarItem(placement: .topBarTrailing) {
                    HStack {
                        Button(action: onScan) {
                            Image(systemName: "camera.viewfinder")
                        }
                        .accessibilityLabel("Scan receipt")
                        Button { showingAdd = true } label: {
                            Image(systemName: "plus")
                        }
                        ProfileToolbarButton(action: onOpenSettings)
                    }
                }
            }
            .sheet(isPresented: $showingAdd) {
                AddCargoView {
                    await model.reload(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
                }
            }
        }
        .task {
            if model.items.isEmpty {
                await model.reload(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
            }
        }
    }

    private var list: some View {
        List {
            if let staleLabel = model.staleLabel {
                Text(staleLabel).rationCaption().listRowBackground(Color.clear)
            }
            if let errorMessage = model.errorMessage {
                ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
            }
            Section {
                ForEach(model.items) { item in
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
            } header: {
                Text("\(model.total) items").rationCaption()
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .refreshable {
            await model.reload(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
        }
    }

    private var filterMenu: some View {
        Menu {
            Button("All") {
                Task {
                    await model.setFilter(nil, api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
                }
            }
            ForEach(CargoDomain.allCases, id: \.self) { domain in
                Button(domain.label) {
                    Task {
                        await model.setFilter(domain, api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
                    }
                }
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
        }
        .accessibilityLabel("Filter cargo")
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
