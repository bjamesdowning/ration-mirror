import SwiftUI

struct TagsSettingsView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var tags: [TagWithCounts] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var successMessage: String?
    @State private var editingId: String?
    @State private var editName = ""
    @State private var editCategory = ""
    @State private var editColor: String?
    @State private var mergeSourceId: String?
    @State private var mergeTargetId = ""
    @State private var mergePendingSourceId: String?
    @State private var tagPendingDeleteId: String?
    @State private var showCleanupConfirm = false
    @State private var busyId: String?
    @State private var newTagName = ""
    @State private var newTagCategory = ""
    @State private var isCreating = false
    @State private var isCleaningUnused = false

    private var unusedTags: [TagWithCounts] {
        tags.filter { $0.cargoCount == 0 && $0.mealCount == 0 }
    }

    private var sortedTags: [TagWithCounts] {
        tags.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var canManage: Bool {
        guard let role = env.session.activeOrg?.role else { return false }
        return role == "owner" || role == "admin"
    }

    var body: some View {
        contentWithCleanupConfirmation
    }

    private var baseContent: some View {
        Group {
            if isLoading {
                LoadingView()
            } else {
                tagsList
            }
        }
        .navigationTitle("Tags")
        .navigationBarTitleDisplayMode(.inline)
        .background(Theme.ceramic)
        .task { await load() }
        .refreshable { await load(isPullToRefresh: true) }
    }

    private var tagsList: some View {
        List {
            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(Theme.danger).font(Typography.caption())
                }
            }
            if let successMessage {
                Section {
                    Text(successMessage).foregroundStyle(Theme.hyperGreen).font(Typography.caption())
                }
            }

            if canManage {
                createTagSection
            }

            Section {
                if tags.isEmpty {
                    Text("No tags yet. Create one below or add tags when labeling cargo or meals.")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                } else {
                    ForEach(sortedTags) { tag in
                        tagRow(tag)
                    }
                }
            } header: {
                Text("Group tags")
            } footer: {
                Text("Up to 10 tags per cargo or meal item. Manage names, colors, and categories here.")
            }

            if canManage, !unusedTags.isEmpty {
                Section {
                    Button(cleanupButtonTitle) {
                        showCleanupConfirm = true
                    }
                    .buttonStyle(.borderless)
                    .foregroundStyle(Theme.warning)
                    .disabled(isCleaningUnused)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }

    private var cleanupButtonTitle: String {
        if isCleaningUnused {
            return "Removing…"
        }
        let suffix = unusedTags.count == 1 ? "" : "s"
        return "Remove \(unusedTags.count) unused tag\(suffix)"
    }

    private var contentWithDeleteConfirmation: some View {
        baseContent
            .confirmationDialog(
                "Delete tag?",
                isPresented: deleteDialogBinding,
                titleVisibility: .visible,
                presenting: tagPendingDeleteId
            ) { tagId in
                Button("Delete", role: .destructive) {
                    if let tag = tags.first(where: { $0.id == tagId }) {
                        Task { await deleteTag(tag) }
                    }
                }
                Button("Cancel", role: .cancel) {
                    tagPendingDeleteId = nil
                }
            } message: { tagId in
                if let tag = tags.first(where: { $0.id == tagId }) {
                    Text("\"\(tag.name)\" will be removed. Items keep their other tags.")
                }
            }
    }

    private var contentWithMergeConfirmation: some View {
        contentWithDeleteConfirmation
            .confirmationDialog(
                "Merge tags?",
                isPresented: mergeDialogBinding,
                titleVisibility: .visible,
                presenting: mergePendingSourceId
            ) { sourceId in
                Button("Merge") {
                    Task { await mergeTag(from: sourceId) }
                }
                Button("Cancel", role: .cancel) {
                    mergePendingSourceId = nil
                }
            } message: { sourceId in
                if let source = tags.first(where: { $0.id == sourceId }),
                   let target = tags.first(where: { $0.id == mergeTargetId }) {
                    Text("All uses of \"\(source.name)\" will move to \"\(target.name)\".")
                }
            }
    }

    private var contentWithCleanupConfirmation: some View {
        contentWithMergeConfirmation
            .confirmationDialog(
                "Remove unused tags?",
                isPresented: $showCleanupConfirm,
                titleVisibility: .visible
            ) {
                Button("Clean up", role: .destructive) {
                    Task { await cleanupUnused() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("\(unusedTags.count) tag\(unusedTags.count == 1 ? "" : "s") with no cargo or meal links will be deleted.")
            }
    }

    private var deleteDialogBinding: Binding<Bool> {
        Binding(
            get: { tagPendingDeleteId != nil },
            set: { isPresented in
                if !isPresented { tagPendingDeleteId = nil }
            }
        )
    }

    private var mergeDialogBinding: Binding<Bool> {
        Binding(
            get: { mergePendingSourceId != nil },
            set: { isPresented in
                if !isPresented { mergePendingSourceId = nil }
            }
        )
    }

    @ViewBuilder
    private var createTagSection: some View {
        Section("Create tag") {
            TextField("Display name", text: $newTagName)
            TextField("Category (optional)", text: $newTagCategory)
            Button(isCreating ? "Creating…" : "Create tag") {
                Task { await createTag() }
            }
            .buttonStyle(.borderless)
            .foregroundStyle(Theme.hyperGreen)
            .disabled(isCreating || newTagName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    @ViewBuilder
    private func tagRow(_ tag: TagWithCounts) -> some View {
        let isBusy = busyId == tag.id

        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                TagColorDot(color: tag.color)
                VStack(alignment: .leading, spacing: 2) {
                    Text(tag.name).foregroundStyle(Theme.carbon)
                    Text(tag.slug).font(Typography.mono(12)).foregroundStyle(Theme.muted)
                }
                Spacer()
                Text("\(tag.cargoCount) cargo · \(tag.mealCount) meals")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
            }

            if canManage, editingId != tag.id, mergeSourceId != tag.id {
                HStack(spacing: 12) {
                    Button("Edit") { startEdit(tag) }
                        .buttonStyle(.borderless)
                        .font(Typography.caption())
                        .foregroundStyle(Theme.hyperGreen)
                        .disabled(isBusy)

                    Button("Merge") {
                        mergeSourceId = tag.id
                        mergeTargetId = ""
                        editingId = nil
                    }
                    .buttonStyle(.borderless)
                    .font(Typography.caption())
                    .disabled(isBusy)

                    Button("Delete", role: .destructive) {
                        if editingId == tag.id { editingId = nil }
                        if mergeSourceId == tag.id {
                            mergeSourceId = nil
                            mergeTargetId = ""
                        }
                        tagPendingDeleteId = tag.id
                    }
                    .buttonStyle(.borderless)
                    .font(Typography.caption())
                    .destructiveDeleteForeground()
                    .disabled(isBusy)
                }
            }

            if editingId == tag.id {
                TextField("Display name", text: $editName)
                TextField("Category (optional)", text: $editCategory)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Color")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                    TagColorPicker(selection: $editColor)
                }
                HStack {
                    Button(isBusy ? "Saving…" : "Save") {
                        Task { await saveEdit(tag.id) }
                    }
                    .buttonStyle(.borderless)
                    .foregroundStyle(Theme.hyperGreen)
                    .disabled(isBusy || editName.trimmingCharacters(in: .whitespaces).isEmpty)

                    Button("Cancel") { cancelEdit() }
                        .buttonStyle(.borderless)
                        .disabled(isBusy)
                }
            }

            if mergeSourceId == tag.id {
                Picker("Merge into", selection: $mergeTargetId) {
                    Text("Select target").tag("")
                    ForEach(tags.filter { $0.id != tag.id }) { target in
                        Text(target.name).tag(target.id)
                    }
                }
                HStack {
                    Button("Confirm merge") {
                        mergePendingSourceId = tag.id
                    }
                    .buttonStyle(.borderless)
                    .foregroundStyle(Theme.hyperGreen)
                    .disabled(isBusy || mergeTargetId.isEmpty)

                    Button("Cancel") {
                        mergeSourceId = nil
                        mergeTargetId = ""
                    }
                    .buttonStyle(.borderless)
                    .disabled(isBusy)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func clearFeedback() {
        errorMessage = nil
        successMessage = nil
    }

    @MainActor
    private func presentError(_ error: Error) {
        if SnapshotRefreshPolicy.isIgnorableRefreshError(error) { return }
        errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }

    @MainActor
    private func createTag() async {
        let trimmedName = newTagName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }
        clearFeedback()
        isCreating = true
        defer { isCreating = false }
        let trimmedCategory = newTagCategory.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            _ = try await env.api.createOrganizationTag(
                CreateTagRequest(
                    name: trimmedName,
                    category: trimmedCategory.isEmpty ? nil : trimmedCategory
                )
            )
            newTagName = ""
            newTagCategory = ""
            successMessage = "Tag created"
            await load()
        } catch {
            presentError(error)
        }
    }

    @MainActor
    private func load(isPullToRefresh: Bool = false) async {
        // Avoid flipping isLoading during pull-to-refresh — that redraw cancels `.refreshable`.
        let showSpinner = tags.isEmpty && !isPullToRefresh
        if showSpinner { isLoading = true }
        defer { if showSpinner { isLoading = false } }
        do {
            let response = try await env.api.organizationTags()
            tags = response.tags
            errorMessage = nil
        } catch {
            presentError(error)
        }
    }

    @MainActor
    private func startEdit(_ tag: TagWithCounts) {
        editingId = tag.id
        editName = tag.name
        editCategory = tag.category ?? ""
        editColor = TagPalette.sanitizedColor(tag.color)
        mergeSourceId = nil
        mergeTargetId = ""
    }

    @MainActor
    private func cancelEdit() {
        editingId = nil
        editColor = nil
    }

    @MainActor
    private func saveEdit(_ tagId: String) async {
        clearFeedback()
        busyId = tagId
        defer { busyId = nil }
        do {
            _ = try await env.api.updateOrganizationTag(
                id: tagId,
                UpdateTagRequest(
                    name: editName.trimmingCharacters(in: .whitespaces),
                    color: TagPalette.sanitizedColor(editColor),
                    category: editCategory.trimmingCharacters(in: .whitespaces).isEmpty
                        ? nil
                        : editCategory.trimmingCharacters(in: .whitespaces)
                )
            )
            editingId = nil
            editColor = nil
            successMessage = "Tag updated"
            await load()
        } catch {
            presentError(error)
        }
    }

    @MainActor
    private func deleteTag(_ tag: TagWithCounts) async {
        tagPendingDeleteId = nil
        clearFeedback()
        busyId = tag.id
        defer { busyId = nil }
        do {
            try await env.api.deleteOrganizationTag(id: tag.id)
            if editingId == tag.id { editingId = nil }
            if mergeSourceId == tag.id {
                mergeSourceId = nil
                mergeTargetId = ""
            }
            successMessage = "Tag deleted"
            await load()
        } catch {
            presentError(error)
        }
    }

    @MainActor
    private func mergeTag(from sourceId: String) async {
        guard !mergeTargetId.isEmpty else { return }
        mergePendingSourceId = nil
        clearFeedback()
        busyId = sourceId
        defer { busyId = nil }
        do {
            _ = try await env.api.mergeOrganizationTag(id: sourceId, targetId: mergeTargetId)
            mergeSourceId = nil
            mergeTargetId = ""
            successMessage = "Tags merged"
            await load()
        } catch {
            presentError(error)
        }
    }

    @MainActor
    private func cleanupUnused() async {
        clearFeedback()
        isCleaningUnused = true
        defer { isCleaningUnused = false }
        for tag in unusedTags {
            do {
                try await env.api.deleteOrganizationTag(id: tag.id)
            } catch {
                presentError(error)
                return
            }
        }
        successMessage = "Unused tags removed"
        await load()
    }
}
