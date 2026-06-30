import SwiftUI

struct AddMealSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var servings = 2
    @State private var directionSteps: [RecipeStep] = [RecipeStep(position: 1, text: "")]
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
                    DirectionsEditorView(steps: $directionSteps)
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
                ToolbarItem(placement: .topBarTrailing) {
                    EditButton()
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
            let trimmedSteps = directionSteps.filter {
                !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
            let directionsPayload: String? = trimmedSteps.isEmpty
                ? nil
                : DirectionsParser.serializeDirections(trimmedSteps)
            let body = CreateMealRequest(
                name: name.trimmingCharacters(in: .whitespaces).lowercased(),
                directions: directionsPayload
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
    @State private var directionSteps: [RecipeStep]
    @State private var isSaving = false
    @State private var errorMessage: String?
    var onSaved: () async -> Void = {}

    init(meal: Meal, onSaved: @escaping () async -> Void = {}) {
        self.meal = meal
        self.onSaved = onSaved
        _name = State(initialValue: meal.name)
        _servings = State(initialValue: meal.servings ?? 2)
        let parsed = DirectionsParser.parseDirections(meal.directions)
        _directionSteps = State(initialValue: parsed.isEmpty ? [RecipeStep(position: 1, text: "")] : parsed)
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
                    DirectionsEditorView(steps: $directionSteps)
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
                ToolbarItem(placement: .topBarTrailing) {
                    EditButton()
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
            let trimmedSteps = directionSteps.filter {
                !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
            let directionsPayload: String? = trimmedSteps.isEmpty
                ? nil
                : DirectionsParser.serializeDirections(trimmedSteps)
            let body = CreateMealRequest(
                name: name.trimmingCharacters(in: .whitespaces).lowercased(),
                directions: directionsPayload,
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
