import SwiftUI

struct MealFormView: View {
    enum Mode {
        case create
        case edit(Meal)
    }

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let mode: Mode
    var onSaved: () async -> Void = {}

    @State private var name: String
    @State private var domain: String
    @State private var description: String
    @State private var servings: Int
    @State private var prepTime: Int
    @State private var cookTime: Int
    @State private var equipmentText: String
    @State private var directionSteps: [RecipeStep]
    @State private var ingredients: [EditableMealIngredient]
    @State private var tags: [String]
    @State private var tagSuggestions: [String] = []
    @State private var cargoItems: [CargoItem] = []
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var editMode: EditMode = .active

    init(mode: Mode, onSaved: @escaping () async -> Void = {}) {
        self.mode = mode
        self.onSaved = onSaved

        switch mode {
        case .create:
            _name = State(initialValue: "")
            _domain = State(initialValue: "food")
            _description = State(initialValue: "")
            _servings = State(initialValue: 2)
            _prepTime = State(initialValue: 0)
            _cookTime = State(initialValue: 0)
            _equipmentText = State(initialValue: "")
            _directionSteps = State(initialValue: [RecipeStep(position: 1, text: "")])
            _ingredients = State(initialValue: [])
            _tags = State(initialValue: [])
        case let .edit(meal):
            _name = State(initialValue: meal.name)
            _domain = State(initialValue: meal.domain)
            _description = State(initialValue: meal.description ?? "")
            _servings = State(initialValue: meal.servings ?? 2)
            _prepTime = State(initialValue: meal.prepTime ?? 0)
            _cookTime = State(initialValue: meal.cookTime ?? 0)
            _equipmentText = State(initialValue: (meal.equipment ?? []).joined(separator: ", "))
            let parsed = DirectionsParser.parseDirections(meal.directions)
            _directionSteps = State(initialValue: parsed.isEmpty ? [RecipeStep(position: 1, text: "")] : parsed)
            _ingredients = State(initialValue: meal.ingredients.map { EditableMealIngredient(from: $0) })
            _tags = State(initialValue: meal.tagSlugs)
        }
    }

    private var navigationTitle: String {
        switch mode {
        case .create: "Add meal"
        case .edit: "Edit meal"
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                if let errorMessage {
                    Section { ErrorBanner(message: errorMessage) }
                }
                Section("Basics") {
                    TextField("Meal name", text: $name)
                    Picker("Domain", selection: $domain) {
                        Text("Food").tag("food")
                        Text("Household").tag("household")
                        Text("Alcohol").tag("alcohol")
                    }
                    Stepper("Servings: \(servings)", value: $servings, in: 1...20)
                    Stepper("Prep (min): \(prepTime)", value: $prepTime, in: 0...600)
                    Stepper("Cook (min): \(cookTime)", value: $cookTime, in: 0...600)
                }
                Section("Description") {
                    TextEditor(text: $description)
                        .frame(minHeight: 80)
                }
                Section("Equipment") {
                    TextField("e.g. oven, blender (comma-separated)", text: $equipmentText)
                        .textInputAutocapitalization(.never)
                }
                Section("Tags") {
                    TagChipEditor(tags: $tags, suggestions: tagSuggestions)
                }
                Section("Ingredients") {
                    MealIngredientEditorView(ingredients: $ingredients, cargoItems: cargoItems)
                }
                Section("Directions") {
                    DirectionsEditorView(steps: $directionSteps)
                }
            }
            .environment(\.editMode, $editMode)
            .navigationTitle(navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .overlay { if isSaving { ProgressView().tint(Theme.hyperGreen) } }
            .task {
                async let tagsTask = env.api.mealTags()
                async let cargoTask = env.api.cargo(limit: 100)
                if let response = try? await tagsTask {
                    tagSuggestions = response.tags
                }
                if let page = try? await cargoTask {
                    cargoItems = page.items
                }
            }
        }
    }

    private var parsedEquipment: [String] {
        equipmentText
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
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
            let trimmedIngredients = ingredients.filter {
                !$0.ingredientName.trimmingCharacters(in: .whitespaces).isEmpty
            }
            let body = CreateMealRequest(
                name: name.trimmingCharacters(in: .whitespaces).lowercased(),
                domain: domain,
                description: description.isEmpty ? nil : description,
                directions: directionsPayload,
                equipment: parsedEquipment,
                servings: servings,
                prepTime: prepTime > 0 ? prepTime : nil,
                cookTime: cookTime > 0 ? cookTime : nil,
                ingredients: trimmedIngredients.enumerated().map { index, ing in
                    ing.toRequest(orderIndex: index)
                },
                tags: tags
            )
            switch mode {
            case .create:
                _ = try await env.api.createMeal(body)
            case let .edit(meal):
                _ = try await env.api.updateMeal(id: meal.id, body)
            }
            Haptics.success()
            await onSaved()
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
