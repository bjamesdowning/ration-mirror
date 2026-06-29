import SwiftUI
import Observation

@MainActor
@Observable
final class CargoDetailViewModel {
    private(set) var item: CargoItem?
    private(set) var isLoading = false
    private(set) var isSaving = false
    var errorMessage: String?

    var name = ""
    var quantity = ""
    var unit = ""

    func load(id: String, api: RationAPI) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await api.cargoItem(id: id)
            item = response.item
            name = response.item.name
            quantity = String(response.item.quantity)
            unit = response.item.unit
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func save(api: RationAPI) async -> Bool {
        guard let item else { return false }
        guard let qty = Double(quantity) else {
            errorMessage = "Quantity must be a number."
            return false
        }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let response = try await api.updateCargo(
                id: item.id,
                UpdateCargoRequest(name: name, quantity: qty, unit: unit)
            )
            self.item = response.item
            Haptics.light()
            return true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }
}

struct CargoDetailView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let itemId: String
    @State private var model = CargoDetailViewModel()

    var body: some View {
        Form {
            Section("Item") {
                TextField("Name", text: $model.name)
                TextField("Quantity", text: $model.quantity)
                    .keyboardType(.decimalPad)
                TextField("Unit", text: $model.unit)
            }

            if let errorMessage = model.errorMessage {
                Section {
                    ErrorBanner(message: errorMessage)
                }
            }

            Section {
                Button("Save changes") {
                    Task {
                        if await model.save(api: env.api) { dismiss() }
                    }
                }
                .disabled(model.isSaving)
            }
        }
        .navigationTitle("Edit Cargo")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load(id: itemId, api: env.api) }
    }
}
