import SwiftUI

struct AddMealSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var servings = 2
    @State private var directions = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    var onSaved: () async -> Void = {}

    var body: some View {
        NavigationStack {
            Form {
                if let errorMessage {
                    Section { ErrorBanner(message: errorMessage) }
                }
                Section("Basics") {
                    TextField("Meal name", text: $name)
                    Stepper("Servings: \(servings)", value: $servings, in: 1...20)
                }
                Section("Directions") {
                    TextField("Optional directions", text: $directions, axis: .vertical)
                        .lineLimit(3...8)
                }
            }
            .navigationTitle("Add meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .overlay { if isSaving { ProgressView().tint(Theme.hyperGreen) } }
        }
    }

    @MainActor
    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let body = CreateMealRequest(
                name: name.trimmingCharacters(in: .whitespaces).lowercased(),
                directions: directions.isEmpty ? nil : directions
            )
            _ = try await env.api.createMeal(body)
            Haptics.success()
            await onSaved()
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct EditMealView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let meal: Meal
    @State private var name: String
    @State private var servings: Int
    @State private var directions: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    var onSaved: () async -> Void = {}

    init(meal: Meal, onSaved: @escaping () async -> Void = {}) {
        self.meal = meal
        self.onSaved = onSaved
        _name = State(initialValue: meal.name)
        _servings = State(initialValue: meal.servings ?? 2)
        _directions = State(initialValue: meal.directions ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                if let errorMessage {
                    Section { ErrorBanner(message: errorMessage) }
                }
                Section("Basics") {
                    TextField("Meal name", text: $name)
                    Stepper("Servings: \(servings)", value: $servings, in: 1...20)
                }
                Section("Directions") {
                    TextField("Directions", text: $directions, axis: .vertical)
                        .lineLimit(3...8)
                }
            }
            .navigationTitle("Edit meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .overlay { if isSaving { ProgressView().tint(Theme.hyperGreen) } }
        }
    }

    @MainActor
    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let body = CreateMealRequest(
                name: name.trimmingCharacters(in: .whitespaces).lowercased(),
                directions: directions.isEmpty ? nil : directions,
                servings: servings
            )
            _ = try await env.api.updateMeal(id: meal.id, body)
            Haptics.success()
            await onSaved()
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
