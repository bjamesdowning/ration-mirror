import SwiftUI

struct SupplyListsLibraryView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var catalog: SupplyCatalogResponse?
    @State private var showingNewList = false
    @State private var saveLive = false
    @State private var errorMessage: String?

    var body: some View {
        List {
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(Theme.danger)
                }
            }
            if let live = catalog?.live {
                Section("Live") {
                    VStack(alignment: .leading, spacing: 4) {
                        Label("Live Supply", systemImage: "circle.fill")
                            .foregroundStyle(Theme.hyperGreen)
                        Text(liveSubtitle(live))
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                        Text("Shop Live on the Supply tab.")
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
            Section("Saved lists") {
                if savedLists.isEmpty {
                    Text("Lists you pull into Live — staples, party, receipts.")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }
                ForEach(savedLists) { summary in
                    NavigationLink {
                        SavedListView(
                            listId: summary.id,
                            createdFrom: summary.createdFrom,
                            listState: summary.state ?? summary.kind ?? "saved"
                        )
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(summary.name)
                                .foregroundStyle(Theme.carbon)
                            Text("\(summary.itemCount ?? 0) items · \(SavedListLogic.originLabel(summary.createdFrom))")
                                .rationCaption()
                                .foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            if !(catalog?.archived ?? []).isEmpty {
                Section("History") {
                    ForEach(catalog?.archived ?? []) { summary in
                        NavigationLink {
                            SavedListView(
                            listId: summary.id,
                            createdFrom: summary.createdFrom,
                            listState: summary.state ?? summary.kind ?? "saved"
                        )
                        } label: {
                            Text(summary.name)
                                .foregroundStyle(Theme.carbon)
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .navigationTitle("Lists")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("New List…") {
                        saveLive = false
                        showingNewList = true
                    }
                    Button("Save Live as List…") {
                        saveLive = true
                        showingNewList = true
                    }
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("New list")
            }
        }
        .sheet(isPresented: $showingNewList) {
            SupplyNewListSheet { name, text in
                guard env.session.activeOrganizationId != nil else { return false }
                if saveLive {
                    do {
                        _ = try await env.api.snapshotLiveSupplyList(name: name)
                        await reload()
                        return true
                    } catch {
                        errorMessage = error.localizedDescription
                        return false
                    }
                }
                return await createList(name: name, text: text)
            }
        }
        .task { await reload() }
    }

    private var savedLists: [SupplyCatalogSummary] {
        (catalog?.saved ?? []) + (catalog?.templates ?? [])
    }

    private func liveSubtitle(_ live: SupplyCatalogSummary) -> String {
        let total = live.itemCount ?? 0
        let inCart = live.purchasedCount ?? 0
        return "\(max(0, total - inCart)) to buy · \(inCart) in cart"
    }

    private func reload() async {
        do {
            catalog = try await env.api.supplyCatalog()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func createList(name: String, text: String) async -> Bool {
        do {
            let created = try await env.api.createSupplyList(name: name)
            if let id = created.list?.id, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                _ = try await env.api.addSupplyItems(listId: id, text: text)
            }
            await reload()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }
}

struct SavedListView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let listId: String
    let createdFrom: String?
    let listState: String
    @State private var model: SavedListViewModel
    @State private var menuItem: SupplyItem?

    init(listId: String, createdFrom: String?, listState: String) {
        self.listId = listId
        self.createdFrom = createdFrom
        self.listState = listState
        _model = State(initialValue: SavedListViewModel(listId: listId))
    }

    private var isArchived: Bool { listState == "archived" }

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(Theme.danger)
                }
            }
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    ListOriginChip(createdFrom: createdFrom)
                    Text("Pulls into Live · \(model.missingCount) missing")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }
                .listRowBackground(Theme.surface)
            }
            if model.items.isEmpty {
                Section {
                    Text("Add things you buy regularly. Pull them into Live when you plan a trip.")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }
            } else if model.missingCount == 0 {
                Section {
                    Text("Everything here is on Live or in Cargo.")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }
            }
            Section {
                ForEach(model.items) { item in
                    SavedListItemRow(
                        item: item,
                        selecting: model.isSelecting,
                        selected: model.selectedIds.contains(item.id),
                        onAdd: { handleAdd(item) },
                        onToggle: { toggle(item.id) },
                        onAddMore: { Task { await model.add(item, onExisting: "add_more", api: env.api) } },
                        onRemove: item.live?.manualOnly == true
                            ? { Task { await model.removeFromLive(item, api: env.api) } }
                            : nil
                    )
                    .swipeActions {
                        if !isArchived {
                            Button(role: .destructive) {
                                Task { await deleteItem(item) }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .navigationTitle(model.list?.name ?? "Saved list")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .bottomBar) {
                Button(createdFrom == "receipt" ? "Add All to Live" : "Add \(model.missingCount) Missing to Live") {
                    Task {
                        if createdFrom == "receipt" {
                            await model.addAll(api: env.api)
                        } else {
                            await model.addMissing(api: env.api)
                        }
                    }
                }
                .disabled(model.items.isEmpty)
            }
            ToolbarItem(placement: .bottomBar) {
                Button(model.isSelecting ? "Done" : "Select") {
                    model.isSelecting.toggle()
                    if !model.isSelecting { model.selectedIds = [] }
                }
                .disabled(isArchived)
            }
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Pin to Live") { pin() }
                    Button(isArchived ? "Restore as saved" : "Duplicate") {
                        Task { await duplicate() }
                    }
                    if listState == "saved" {
                        Button("Archive") { Task { await archive() } }
                    }
                    Button("Delete", role: .destructive) { Task { await deleteList() } }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("List actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if model.isSelecting {
                Button("Add \(model.selectedIds.count) to Live") {
                    Task { await model.addSelected(api: env.api) }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(model.selectedIds.isEmpty)
                .padding()
            }
        }
        .confirmationDialog(
            menuItem?.name.capitalized ?? "On Live",
            isPresented: Binding(
                get: { menuItem != nil },
                set: { if !$0 { menuItem = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Add More") {
                guard let menuItem else { return }
                Task { await model.add(menuItem, onExisting: "add_more", api: env.api) }
            }
            if menuItem?.live?.manualOnly == true {
                Button("Remove from Live") {
                    guard let menuItem else { return }
                    Task { await model.removeFromLive(menuItem, api: env.api) }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            if let toast = model.toast {
                TransientSuccessToast(message: toast) {
                    model.toast = nil
                }
                .padding(.bottom, 24)
            }
        }
        .task { await model.load(api: env.api) }
    }

    private func handleAdd(_ item: SupplyItem) {
        switch model.tap(item) {
        case .add:
            Task { await model.add(item, api: env.api) }
        case .menu:
            menuItem = item
        }
    }

    private func toggle(_ id: String) {
        if model.selectedIds.contains(id) {
            model.selectedIds.remove(id)
        } else {
            model.selectedIds.insert(id)
        }
    }

    private func pin() {
        guard let organizationId = env.session.activeOrganizationId else { return }
        UserDefaults.standard.set(listId, forKey: SavedListLogic.pinnedListKey(organizationId: organizationId))
        model.toast = "Pinned to Live"
    }

    private func duplicate() async {
        do {
            _ = try await env.api.duplicateSupplyList(id: listId, name: nil)
            model.toast = isArchived ? "Restored as a saved list" : "Duplicated"
        } catch {
            model.errorMessage = error.localizedDescription
        }
    }

    private func archive() async {
        do {
            _ = try await env.api.archiveSupplyList(id: listId)
            dismiss()
        } catch {
            model.errorMessage = error.localizedDescription
        }
    }

    private func deleteList() async {
        do {
            _ = try await env.api.deleteSupplyList(id: listId)
            dismiss()
        } catch {
            model.errorMessage = error.localizedDescription
        }
    }

    private func deleteItem(_ item: SupplyItem) async {
        do {
            try await env.api.deleteSupplyItem(listId: listId, itemId: item.id)
            await model.load(api: env.api)
        } catch {
            model.errorMessage = error.localizedDescription
        }
    }
}

struct PullFromListSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let catalog: SupplyCatalogResponse?
    let organizationId: String
    let liveItemCount: Int
    var onChanged: () async -> Void

    @State private var selectedId: String = ""
    @State private var items: [SupplyItem] = []
    @State private var menuItem: SupplyItem?
    @State private var toast: String?

    private var lists: [SupplyCatalogSummary] {
        (catalog?.saved ?? []) + (catalog?.templates ?? [])
    }

    var body: some View {
        NavigationStack {
            List {
                if lists.isEmpty {
                    Text("Save a list, then pull items into Live while you shop.")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                } else {
                    Picker("Saved list", selection: $selectedId) {
                        ForEach(lists) { list in
                            Text(list.name).tag(list.id)
                        }
                    }
                    if liveItemCount == 0, let name = lists.first(where: { $0.id == selectedId })?.name {
                        Button("Add missing from \(name)") {
                            Task { await addMissing() }
                        }
                    }
                    ForEach(items) { item in
                        SavedListItemRow(
                            item: item,
                            selecting: false,
                            selected: false,
                            onAdd: { handleAdd(item) },
                            onToggle: {},
                            onAddMore: { Task { await add(item, onExisting: "add_more") } },
                            onRemove: nil
                        )
                    }
                }
            }
            .navigationTitle("Pull from")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Pin to Live") { pin() }
                        .disabled(selectedId.isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        .onAppear { selectInitialList() }
        .task(id: selectedId) { await loadItems() }
        .confirmationDialog("On Live", isPresented: Binding(
            get: { menuItem != nil },
            set: { if !$0 { menuItem = nil } }
        )) {
            Button("Add More") {
                guard let menuItem else { return }
                Task { await add(menuItem, onExisting: "add_more") }
            }
            Button("Cancel", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            if let toast {
                TransientSuccessToast(message: toast) { self.toast = nil }
                    .padding(.bottom, 12)
            }
        }
    }

    private func selectInitialList() {
        let pinned = UserDefaults.standard.string(forKey: SavedListLogic.pinnedListKey(organizationId: organizationId))
        selectedId = lists.first(where: { $0.id == pinned })?.id ?? lists.first?.id ?? ""
    }

    private func pin() {
        UserDefaults.standard.set(selectedId, forKey: SavedListLogic.pinnedListKey(organizationId: organizationId))
    }

    private func loadItems() async {
        guard !selectedId.isEmpty else {
            items = []
            return
        }
        items = (try? await env.api.supplyList(id: selectedId).list?.items) ?? []
    }

    private func handleAdd(_ item: SupplyItem) {
        switch SavedListLogic.tap(liveState: item.live?.state) {
        case .add:
            Task { await add(item, onExisting: "skip") }
        case .menu:
            menuItem = item
        }
    }

    private func add(_ item: SupplyItem, onExisting: String) async {
        do {
            let response = try await env.api.copySupplyListToLive(
                id: selectedId,
                itemIds: [item.id],
                mode: onExisting == "add_more" ? "add_all" : "missing_only",
                onExisting: onExisting
            )
            if let counts = response.result?.counts {
                toast = SavedListLogic.toast(for: counts, name: item.name)
            }
            await loadItems()
            await onChanged()
        } catch {
            toast = error.localizedDescription
        }
    }

    private func addMissing() async {
        do {
            let response = try await env.api.copySupplyListToLive(
                id: selectedId,
                itemIds: nil,
                mode: "missing_only",
                onExisting: "skip"
            )
            if let counts = response.result?.counts {
                toast = SavedListLogic.toast(for: counts)
            }
            await loadItems()
            await onChanged()
        } catch {
            toast = error.localizedDescription
        }
    }
}
