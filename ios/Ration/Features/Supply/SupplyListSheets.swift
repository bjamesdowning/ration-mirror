import SwiftUI

struct SupplyQuickAddSheet: View {
    @Environment(\.dismiss) private var dismiss

    let listName: String
    var onAdd: (String) async -> Bool

    @State private var text = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @FocusState private var focused: Bool

    private var preview: [SupplyQuickAddItem] {
        SupplyQuickAddParser.parse(text)
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("One line or a comma-separated jot. Quantities like 2 lb chicken work too.")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
                TextEditor(text: $text)
                    .focused($focused)
                    .frame(minHeight: 120)
                    .padding(8)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Theme.platinum, lineWidth: 1)
                    )
                    .overlay(alignment: .topLeading) {
                        if text.isEmpty {
                            Text("butter, eggs, bread, milk")
                                .foregroundStyle(Theme.muted)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 16)
                                .allowsHitTesting(false)
                        }
                    }
                if !preview.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(preview.enumerated()), id: \.offset) { _, item in
                            Text(previewLabel(item))
                                .font(Typography.body())
                                .foregroundStyle(Theme.carbon)
                        }
                    }
                }
                if let errorMessage {
                    Text(errorMessage)
                        .font(Typography.caption())
                        .foregroundStyle(.red)
                }
                Button(preview.count == 1 ? "Add 1 item" : "Add \(preview.count) items") {
                    Task { await submit() }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isSaving || preview.isEmpty)
                Spacer(minLength: 0)
            }
            .padding(16)
            .background(Theme.ceramic)
            .navigationTitle("Add to \(listName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear { focused = true }
    }

    private func previewLabel(_ item: SupplyQuickAddItem) -> String {
        let title = item.name.capitalized
        if item.quantity == 1, item.unit == "unit" { return title }
        let qty = item.quantity.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(item.quantity))
            : String(item.quantity)
        if item.unit == "unit" { return "\(qty)× \(title)" }
        return "\(qty) \(item.unit) \(title)"
    }

    private func submit() async {
        isSaving = true
        defer { isSaving = false }
        errorMessage = nil
        if await onAdd(text) {
            Haptics.success()
            dismiss()
        } else if errorMessage == nil {
            errorMessage = "Could not add those items. Try again."
        }
    }
}

struct SupplyNewListSheet: View {
    @Environment(\.dismiss) private var dismiss

    var onCreate: (String, String) async -> Bool

    @State private var name = ""
    @State private var text = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @FocusState private var focusedName: Bool

    private var previewCount: Int { SupplyQuickAddParser.parse(text).count }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("A list you keep. Adding it to Live later does not erase it.")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
                TextField("List name", text: $name)
                    .textInputAutocapitalization(.words)
                    .focused($focusedName)
                    .padding(12)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                TextEditor(text: $text)
                    .frame(minHeight: 100)
                    .padding(8)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(alignment: .topLeading) {
                        if text.isEmpty {
                            Text("Optional: butter, eggs, bread")
                                .foregroundStyle(Theme.muted)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 16)
                                .allowsHitTesting(false)
                        }
                    }
                if let errorMessage {
                    Text(errorMessage)
                        .font(Typography.caption())
                        .foregroundStyle(.red)
                }
                Button(isSaving ? "Creating…" : "Create list") {
                    Task { await submit() }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isSaving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if previewCount > 0 {
                    Text("\(previewCount) item\(previewCount == 1 ? "" : "s") will be added")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .background(Theme.ceramic)
            .navigationTitle("New list")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear { focusedName = true }
    }

    private func submit() async {
        isSaving = true
        defer { isSaving = false }
        errorMessage = nil
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if await onCreate(trimmed, text) {
            Haptics.success()
            dismiss()
        } else if errorMessage == nil {
            errorMessage = "Could not create that list. Try again."
        }
    }
}

struct SupplyListsSheet: View {
    @Environment(\.dismiss) private var dismiss

    let catalog: SupplyCatalogResponse?
    let selectedId: String?
    var onSelect: (SupplyCatalogSummary) -> Void
    var onNewList: () -> Void

    var body: some View {
        NavigationStack {
            List {
                if let live = catalog?.live {
                    Section("Shopping") {
                        listButton(live, subtitle: "Live · updates from meals and cargo")
                    }
                }
                Section("Your lists") {
                    ForEach(catalog?.saved ?? []) { summary in
                        listButton(summary, subtitle: itemCountLabel(summary))
                    }
                    Button {
                        dismiss()
                        onNewList()
                    } label: {
                        Label("New list", systemImage: "plus")
                    }
                }
                if !(catalog?.templates ?? []).isEmpty || !(catalog?.archived ?? []).isEmpty {
                    Section("More") {
                        ForEach(catalog?.templates ?? []) { summary in
                            listButton(summary, subtitle: "Template")
                        }
                        ForEach(catalog?.archived ?? []) { summary in
                            listButton(summary, subtitle: "Archived")
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.ceramic)
            .navigationTitle("Lists")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func listButton(_ summary: SupplyCatalogSummary, subtitle: String) -> some View {
        Button {
            onSelect(summary)
            dismiss()
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(summary.name.capitalized)
                        .foregroundStyle(Theme.carbon)
                    Text(subtitle)
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                if summary.id == selectedId {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Theme.hyperGreen)
                }
            }
        }
    }

    private func itemCountLabel(_ summary: SupplyCatalogSummary) -> String {
        let count = summary.itemCount ?? 0
        return count == 1 ? "1 item" : "\(count) items"
    }
}
