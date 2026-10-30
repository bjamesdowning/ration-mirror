import SwiftUI

struct SupplyListsLibraryView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.currentMainTab) private var currentMainTab
    @Environment(\.dismiss) private var dismiss
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
                Section {
                    Button {
                        dismiss()
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Label("Live Supply", systemImage: "circle.fill")
                                    .foregroundStyle(Theme.hyperGreen)
                                Text(liveSubtitle(live))
                                    .rationCaption()
                                    .foregroundStyle(Theme.muted)
                                Text("The list you are shopping now.")
                                    .rationCaption()
                                    .foregroundStyle(Theme.muted)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Theme.muted)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Live Supply")
                    .accessibilityHint("Opens Supply")
                } header: {
                    Text("Live")
                } footer: {
                    Text("Live Supply is the trip you are shopping. A saved list stays separate until you add its items into Live Supply.")
                }
            }
            Section("Saved lists") {
                if savedLists.isEmpty {
                    Text("Lists you keep and can add into Live Supply — staples, a party, a receipt.")
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
        .tabDockAction(tag: .supply, layer: .lists, isActive: currentMainTab == .supply) {
            IconFABMenuCore(
                systemImage: "plus.circle.fill",
                accessibilityLabel: "Lists actions",
                disabled: !env.network.isOnline
            ) {
                Button {
                    saveLive = false
                    showingNewList = true
                } label: {
                    Label("New saved list…", systemImage: "plus.rectangle.on.rectangle")
                }
                Button {
                    saveLive = true
                    showingNewList = true
                } label: {
                    Label("Save Live Supply as a list…", systemImage: "square.and.arrow.down")
                }
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
    @Environment(\.currentMainTab) private var currentMainTab
    @Environment(\.dismiss) private var dismiss
    let listId: String
    let createdFrom: String?
    let listState: String
    @State private var model: SavedListViewModel
    @State private var menuItem: SupplyItem?
    @State private var showingAddItem = false

    init(listId: String, createdFrom: String?, listState: String) {
        self.listId = listId
        self.createdFrom = createdFrom
        self.listState = listState
        _model = State(initialValue: SavedListViewModel(listId: listId))
    }

    private var isArchived: Bool { listState == "archived" }

    var body: some View {
        savedListRows
            .scrollContentBackground(.hidden)
            .background(Theme.ceramic)
        .navigationTitle(model.list?.name ?? "Saved list")
        .navigationBarTitleDisplayMode(.large)
        .tabDockAction(tag: .supply, layer: .detail, isActive: currentMainTab == .supply) {
            IconFABMenuCore(
                systemImage: "plus.circle.fill",
                accessibilityLabel: "List actions",
                disabled: !env.network.isOnline
            ) {
                Button {
                    showingAddItem = true
                } label: {
                    Label("Add to list", systemImage: "plus")
                }
                .disabled(isArchived || !env.network.isOnline)
                Button {
                    Task { await model.addMissing(api: env.api) }
                } label: {
                    Label("Add missing to Live", systemImage: "arrow.down.doc")
                }
                .disabled(model.items.isEmpty || !env.network.isOnline)
                Button {
                    Task { await duplicate() }
                } label: {
                    Label(
                        isArchived ? "Restore this list" : "Duplicate this list",
                        systemImage: isArchived ? "arrow.uturn.backward" : "doc.on.doc"
                    )
                }
                if listState == "saved" {
                    Button {
                        Task { await archive() }
                    } label: {
                        Label("Archive this list", systemImage: "archivebox")
                    }
                }
                Button(role: .destructive) {
                    Task { await deleteList() }
                } label: {
                    Label("Delete this list", systemImage: "trash")
                }
            }
        }
        .onAppear { env.tabDock.bumpContentEpoch() }
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
        .sheet(isPresented: $showingAddItem) {
            SupplyQuickAddSheet(listName: "list") { text in
                do {
                    _ = try await env.api.addSupplyItems(listId: listId, text: text)
                    await model.load(api: env.api)
                    return true
                } catch {
                    model.errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                    return false
                }
            }
        }
        .task { await model.load(api: env.api) }
    }

    private var savedListRows: some View {
        List {
            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(Theme.danger)
                }
            }
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    ListOriginChip(createdFrom: createdFrom)
                    Text("Separate from Live Supply · \(model.missingCount) not on it yet")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }
                .listRowBackground(Theme.surface)
            }
            if model.items.isEmpty {
                Section {
                    Text("Add things you buy again. They stay on this list until you add them to Live Supply.")
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
                    savedRow(item)
                }
            }
        }
    }

    private func savedRow(_ item: SupplyItem) -> some View {
        SavedListItemRow(
            item: item,
            selecting: model.isSelecting,
            selected: model.selectedIds.contains(item.id),
            onAdd: { handleAdd(item) },
            onToggle: { toggle(item.id) },
            onAddMore: { Task { await model.add(item, onExisting: "add_more", api: env.api) } },
            onRemove: item.live?.manualOnly == true
                ? { Task { await model.removeFromLive(item, api: env.api) } }
                : nil,
            onRemoveFromList: isArchived ? nil : { Task { await deleteItem(item) } }
        )
        .swipeActions {
            if !isArchived {
                Button(role: .destructive) {
                    Task { await deleteItem(item) }
                } label: {
                    Label("Remove", systemImage: "trash")
                }
            }
        }
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
                    Button("Add missing to Live") { Task { await addMissing() } }
                        .disabled(selectedId.isEmpty || items.isEmpty)
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
        selectedId = lists.first?.id ?? ""
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
