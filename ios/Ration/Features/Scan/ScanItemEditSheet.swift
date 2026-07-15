import SwiftUI

struct ScanItemEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppEnvironment.self) private var env

    let item: EditableScanResultItem
    var onSave: (EditableScanResultItem) -> String?

    @State private var name: String
    @State private var quantity: String
    @State private var unit: String
    @State private var domain: String
    @State private var tags: [String]
    @State private var hasExpiry: Bool
    @State private var expiresAt: Date
    @State private var tagSuggestions: [String] = []
    @State private var validationError: String?
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case name, quantity
    }

    init(item: EditableScanResultItem, onSave: @escaping (EditableScanResultItem) -> String?) {
        self.item = item
        self.onSave = onSave
        _name = State(initialValue: item.name)
        _quantity = State(initialValue: EditableScanResultItem.formatQuantity(item.quantity))
        _unit = State(initialValue: item.unit)
        _domain = State(initialValue: item.domain ?? "food")
        _tags = State(initialValue: item.tags)
        _hasExpiry = State(initialValue: item.expiresAt != nil)
        _expiresAt = State(initialValue: item.expiresAt ?? Date().addingTimeInterval(60 * 60 * 24 * 7))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Item") {
                    TextField("Name", text: $name)
                        .textInputAutocapitalization(.never)
                        .focused($focusedField, equals: .name)
                    HStack {
                        TextField("Quantity", text: $quantity)
                            .keyboardType(.decimalPad)
                            .focused($focusedField, equals: .quantity)
                        UnitPicker(units: RationUnits.cargoEdit, selection: $unit)
                    }
                    Picker("Domain", selection: $domain) {
                        ForEach(CargoDomain.allCases, id: \.self) { d in
                            Text(d.label).tag(d.rawValue)
                        }
                    }
                    TagChipEditor(tags: $tags, suggestions: tagSuggestions)
                }

                Section {
                    Toggle("Has expiry date", isOn: $hasExpiry)
                    if hasExpiry {
                        DatePicker("Expires", selection: $expiresAt, displayedComponents: .date)
                    }
                }

                if let validationError {
                    Section {
                        Text(validationError)
                            .font(Typography.caption())
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Edit item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .task {
                if let response = try? await env.api.cargoTags() {
                    tagSuggestions = response.tags
                }
            }
            .rationFormKeyboardToolbar { focusedField = nil }
        }
        .presentationDetents([.large])
    }

    private func save() {
        switch item.applyingEdit(
            name: name,
            quantityText: quantity,
            unit: unit,
            domain: domain,
            tags: tags,
            hasExpiry: hasExpiry,
            expiresAt: expiresAt
        ) {
        case let .saved(updated):
            if let error = onSave(updated) {
                validationError = error
            } else {
                dismiss()
            }
        case let .invalidName(message), let .invalidQuantity(message):
            validationError = message
        }
    }
}
