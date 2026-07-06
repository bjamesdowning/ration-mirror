import SwiftUI

struct ProvisionFormView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    var onSaved: () async -> Void = {}

    @State private var name = ""
    @State private var quantity = "1"
    @State private var unit = "unit"
    @State private var domain = "food"
    @State private var tags: [String] = []
    @State private var tagSuggestions: [String] = []
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showingPaywall = false

    var body: some View {
        NavigationStack {
            Form {
                if let errorMessage {
                    Section { ErrorBanner(message: errorMessage) }
                }
                Section("Item") {
                    TextField("Item name", text: $name)
                        .textInputAutocapitalization(.never)
                    HStack {
                        TextField("Quantity", text: $quantity)
                            .keyboardType(.decimalPad)
                        UnitPicker(units: RationUnits.all, selection: $unit)
                    }
                    Picker("Domain", selection: $domain) {
                        Text("Food").tag("food")
                        Text("Household").tag("household")
                        Text("Alcohol").tag("alcohol")
                    }
                }
                Section("Tags (optional)") {
                    TagChipEditor(tags: $tags, suggestions: tagSuggestions)
                }
            }
            .navigationTitle("Add provision")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add Item") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .overlay { if isSaving { ProgressView().tint(Theme.hyperGreen) } }
            .sheet(isPresented: $showingPaywall) { PaywallView() }
            .task {
                if let response = try? await env.api.cargoTags() {
                    tagSuggestions = response.tags
                }
            }
        }
    }

    @MainActor
    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        let qty = Double(quantity) ?? 1
        let body = CreateProvisionRequest(
            name: name.trimmingCharacters(in: .whitespaces).lowercased(),
            domain: domain,
            quantity: qty,
            unit: unit.isEmpty ? "unit" : unit,
            tags: tags
        )

        do {
            _ = try await env.api.createProvision(body)
            Haptics.success()
            await onSaved()
            dismiss()
        } catch let error as APIError where isCapacityExceeded(error) {
            showingPaywall = true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func isCapacityExceeded(_ error: APIError) -> Bool {
        guard case .server(let status, let message, let code, _, _) = error else { return false }
        return status == 403 && (code == "capacity_exceeded" || message == "capacity_exceeded")
    }
}
