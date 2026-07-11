import SwiftUI

struct TagsSettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    @State private var tags: [TagWithCounts] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var successMessage: String?
    @State private var editingId: String?
    @State private var editName = ""
    @State private var editCategory = ""
    @State private var mergeSourceId: String?
    @State private var mergeTargetId = ""
    @State private var busyId: String?
    @State private var newTagName = ""
    @State private var newTagSlug = ""
    @State private var newTagCategory = ""
    @State private var slugManuallyEdited = false
    @State private var isCreating = false

    private var unusedTags: [TagWithCounts] {
        tags.filter { $0.cargoCount == 0 && $0.mealCount == 0 }
    }

    private var canManage: Bool {
        guard let role = env.session.activeOrg?.role else { return false }
        return role == "owner" || role == "admin"
    }

    var body: some View {
        Group {
            if isLoading {
                LoadingView()
            } else {
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
                            ForEach(tags.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }) { tag in
                                tagRow(tag)
                            }
                        }
                    } header: {
                        Text("Group tags")
                    } footer: {
                        Text("Up to 10 tags per cargo or meal item. Manage names and categories here.")
                    }

                    if canManage, !unusedTags.isEmpty {
                        Section {
                            Button("Remove \(unusedTags.count) unused tag\(unusedTags.count == 1 ? "" : "s")") {
                                Task { await cleanupUnused() }
                            }
                            .foregroundStyle(Theme.warning)
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
            }
        }
        .navigationTitle("Tags")
        .navigationBarTitleDisplayMode(.inline)
        .background(Theme.ceramic)
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private var createTagSection: some View {
        Section("Create tag") {
            TextField("Display name", text: $newTagName)
                .onChange(of: newTagName) { _, value in
                    if !slugManuallyEdited {
                        newTagSlug = normalizeTagSlug(value)
                    }
                }
            TextField("Slug", text: $newTagSlug)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: newTagSlug) { _, _ in slugManuallyEdited = true }
            TextField("Category (optional)", text: $newTagCategory)
            Button(isCreating ? "Creating…" : "Create tag") {
                Task { await createTag() }
            }
            .foregroundStyle(Theme.hyperGreen)
            .disabled(isCreating || normalizeTagSlug(newTagSlug).isEmpty)
        }
    }

    private func normalizeTagSlug(_ input: String) -> String {
        input
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
            .filter { $0.isLetter || $0.isNumber || $0 == "-" }
            .prefix(50)
            .description
    }

    @ViewBuilder
    private func tagRow(_ tag: TagWithCounts) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
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
                        .font(Typography.caption())
                        .foregroundStyle(Theme.hyperGreen)
                    Button("Merge") {
                        mergeSourceId = tag.id
                        mergeTargetId = ""
                        editingId = nil
                    }
                    .font(Typography.caption())
                    Button("Delete", role: .destructive) {
                        Task { await deleteTag(tag) }
                    }
                    .font(Typography.caption())
                }
            }

            if editingId == tag.id {
                TextField("Display name", text: $editName)
                TextField("Category (optional)", text: $editCategory)
                HStack {
                    Button("Save") { Task { await saveEdit(tag.id) } }
                        .foregroundStyle(Theme.hyperGreen)
                    Button("Cancel") { editingId = nil }
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
                    Button("Confirm merge") { Task { await mergeTag(from: tag.id) } }
                        .foregroundStyle(Theme.hyperGreen)
                        .disabled(mergeTargetId.isEmpty)
                    Button("Cancel") { mergeSourceId = nil }
                }
            }
        }
        .padding(.vertical, 4)
    }

    @MainActor
    private func createTag() async {
        let slug = normalizeTagSlug(newTagSlug)
        guard !slug.isEmpty else { return }
        isCreating = true
        defer { isCreating = false }
        let trimmedName = newTagName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedCategory = newTagCategory.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            _ = try await env.api.createOrganizationTag(
                CreateTagRequest(
                    slug: slug,
                    name: trimmedName.isEmpty ? nil : trimmedName,
                    category: trimmedCategory.isEmpty ? nil : trimmedCategory
                )
            )
            newTagName = ""
            newTagSlug = ""
            newTagCategory = ""
            slugManuallyEdited = false
            successMessage = "Tag created"
            await load()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func load() async {
        isLoading = tags.isEmpty
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response = try await env.api.organizationTags()
            tags = response.tags
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func startEdit(_ tag: TagWithCounts) {
        editingId = tag.id
        editName = tag.name
        editCategory = tag.category ?? ""
        mergeSourceId = nil
    }

    @MainActor
    private func saveEdit(_ tagId: String) async {
        busyId = tagId
        defer { busyId = nil }
        do {
            _ = try await env.api.updateOrganizationTag(
                id: tagId,
                UpdateTagRequest(
                    name: editName.trimmingCharacters(in: .whitespaces),
                    category: editCategory.trimmingCharacters(in: .whitespaces).isEmpty
                        ? nil
                        : editCategory.trimmingCharacters(in: .whitespaces)
                )
            )
            editingId = nil
            successMessage = "Tag updated"
            await load()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func deleteTag(_ tag: TagWithCounts) async {
        busyId = tag.id
        defer { busyId = nil }
        do {
            try await env.api.deleteOrganizationTag(id: tag.id)
            successMessage = "Tag deleted"
            await load()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func mergeTag(from sourceId: String) async {
        guard !mergeTargetId.isEmpty else { return }
        busyId = sourceId
        defer { busyId = nil }
        do {
            _ = try await env.api.mergeOrganizationTag(id: sourceId, targetId: mergeTargetId)
            mergeSourceId = nil
            mergeTargetId = ""
            successMessage = "Tags merged"
            await load()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func cleanupUnused() async {
        for tag in unusedTags {
            do {
                try await env.api.deleteOrganizationTag(id: tag.id)
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                return
            }
        }
        successMessage = "Unused tags removed"
        await load()
    }
}
