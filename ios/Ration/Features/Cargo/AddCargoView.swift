import SwiftUI

struct AddCargoView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    /// Called after a successful create so the list can refresh.
    let onCreated: () async -> Void

    @State private var name = ""
    @State private var quantity = "1"
    @State private var unit = "unit"
    @State private var domain: CargoDomain = .food
    @State private var hasExpiry = false
    @State private var expiresAt = Date().addingTimeInterval(60 * 60 * 24 * 7)

    @State private var isSaving = false
    @State private var errorMessage: String?

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
                            Text(d.label).tag(d)
                        }
                    }
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
            .navigationTitle("Add cargo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isSaving || name.isEmpty)
                }
            }
        }
    }

    private func save() async {
        errorMessage = nil
        isSaving = true
        defer { isSaving = false }

        let qty = Double(quantity) ?? 1
        let body = CreateCargoRequest(
            name: name,
            quantity: qty,
            unit: unit.isEmpty ? "unit" : unit,
            domain: domain.rawValue,
            tags: [],
            expiresAt: hasExpiry ? expiresAt : nil
        )

        do {
            _ = try await env.api.createCargo(body)
            await onCreated()
            dismiss()
        } catch let error as APIError {
            // 409 merge_candidate is surfaced as a server error here for the MVP.
            errorMessage = error.code == "invalid_merge_target"
                ? "Could not merge with an existing item."
                : error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
