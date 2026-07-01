import SwiftUI

struct CargoFormView: View {
    enum Mode {
        case create
        case edit(CargoItem)
    }

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let mode: Mode
    var onSaved: () async -> Void = {}

    @State private var name: String
    @State private var quantity: String
    @State private var unit: String
    @State private var domain: String
    @State private var tags: [String]
    @State private var hasExpiry: Bool
    @State private var expiresAt: Date
    @State private var tagSuggestions: [String] = []
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(mode: Mode, onSaved: @escaping () async -> Void = {}) {
        self.mode = mode
        self.onSaved = onSaved

        switch mode {
        case .create:
            _name = State(initialValue: "")
            _quantity = State(initialValue: "1")
            _unit = State(initialValue: "unit")
            _domain = State(initialValue: CargoDomain.food.rawValue)
            _tags = State(initialValue: [])
            _hasExpiry = State(initialValue: false)
            _expiresAt = State(initialValue: Date().addingTimeInterval(60 * 60 * 24 * 7))
        case let .edit(item):
            _name = State(initialValue: item.name)
            _quantity = State(initialValue: String(item.quantity))
            _unit = State(initialValue: item.unit)
            _domain = State(initialValue: item.domain)
            _tags = State(initialValue: item.tags)
            _hasExpiry = State(initialValue: item.expiresAt != nil)
            _expiresAt = State(initialValue: item.expiresAt ?? Date())
        }
    }

    private var navigationTitle: String {
        switch mode {
        case .create: "Add cargo"
        case .edit: "Edit Cargo"
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Item") {
                    TextField("Name", text: $name)
                    HStack {
                        TextField("Quantity", text: $quantity)
                            .keyboardType(.decimalPad)
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

                if let errorMessage {
                    Section { ErrorBanner(message: errorMessage) }
                }
            }
            .navigationTitle(navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isSaving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .task {
                if let response = try? await env.api.cargoTags() {
                    tagSuggestions = response.tags
                }
            }
        }
    }

    @MainActor
    private func save() async {
        errorMessage = nil
        guard let qty = Double(quantity) else {
            errorMessage = "Quantity must be a number."
            return
        }
        isSaving = true
        defer { isSaving = false }

        let expiry = hasExpiry ? expiresAt : nil

        do {
            switch mode {
            case .create:
                let body = CreateCargoRequest(
                    name: name,
                    quantity: qty,
                    unit: unit.isEmpty ? "unit" : unit,
                    domain: domain,
                    tags: tags,
                    expiresAt: expiry
                )
                _ = try await env.api.createCargo(body)
            case let .edit(item):
                _ = try await env.api.updateCargo(
                    id: item.id,
                    UpdateCargoRequest(
                        name: name,
                        quantity: qty,
                        unit: unit,
                        domain: domain,
                        tags: tags,
                        expiresAt: expiry
                    )
                )
            }
            Haptics.light()
            await onSaved()
            dismiss()
        } catch let error as APIError {
            errorMessage = error.code == "invalid_merge_target"
                ? "Could not merge with an existing item."
                : error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
