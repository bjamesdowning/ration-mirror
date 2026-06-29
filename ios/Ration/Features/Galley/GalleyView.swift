import SwiftUI
import Observation

@MainActor
@Observable
final class GalleyViewModel {
    private(set) var meals: [Meal] = []
    private(set) var isLoading = false
    var errorMessage: String?

    func load(api: RationAPI) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            meals = try await api.meals().meals
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct GalleyView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var model = GalleyViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.meals.isEmpty {
                    LoadingView()
                } else if let errorMessage = model.errorMessage, model.meals.isEmpty {
                    VStack(spacing: 16) {
                        ErrorBanner(message: errorMessage)
                        Button("Retry") { Task { await model.load(api: env.api) } }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(24)
                } else if model.meals.isEmpty {
                    EmptyStateView(
                        icon: "fork.knife",
                        title: "No galley plans yet",
                        message: "Meals and provisions from the web Galley appear here."
                    )
                } else {
                    List(model.meals) { meal in
                        NavigationLink {
                            MealDetailView(mealId: meal.id, initialMeal: meal)
                        } label: {
                            MealRow(meal: meal)
                        }
                        .listRowBackground(Theme.surface)
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                    .refreshable { await model.load(api: env.api) }
                }
            }
            .navigationTitle("Galley")
            .background(Theme.ceramic)
        }
        .task { if model.meals.isEmpty { await model.load(api: env.api) } }
    }
}

struct MealRow: View {
    let meal: Meal

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(meal.name.capitalized).rationBody()
            HStack(spacing: 8) {
                Text(meal.type.capitalized)
                if let servings = meal.servings {
                    Text("\(servings) servings")
                }
                if let prepTime = meal.prepTime {
                    Text("\(prepTime)m prep")
                }
            }
            .rationCaption()
            if !meal.tags.isEmpty {
                Text(meal.tags.prefix(4).joined(separator: " / "))
                    .rationCaption()
            }
        }
        .padding(.vertical, 4)
    }
}

struct MealDetailView: View {
    @Environment(AppEnvironment.self) private var env
    let mealId: String
    let initialMeal: Meal
    @State private var meal: Meal?
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let errorMessage {
                    ErrorBanner(message: errorMessage)
                }
                let displayMeal = meal ?? initialMeal
                header(displayMeal)
                if !displayMeal.ingredients.isEmpty {
                    ingredients(displayMeal.ingredients)
                }
                if let directions = displayMeal.directions, !directions.isEmpty {
                    GlassCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Directions").rationHeadline()
                            Text(directions).rationBody()
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.ceramic)
        .navigationTitle((meal ?? initialMeal).name.capitalized)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func header(_ meal: Meal) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text(meal.name.capitalized).rationTitle()
                if let description = meal.description, !description.isEmpty {
                    Text(description).rationBody()
                }
                HStack {
                    Label(meal.domain.capitalized, systemImage: "circle.hexagongrid")
                    if let cookTime = meal.cookTime {
                        Label("\(cookTime)m cook", systemImage: "timer")
                    }
                }
                .rationCaption()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func ingredients(_ ingredients: [MealIngredient]) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Ingredients").rationHeadline()
                ForEach(ingredients) { ingredient in
                    HStack {
                        Text(ingredient.ingredientName.capitalized).rationBody()
                        Spacer()
                        Text("\(ingredient.quantity.formatted()) \(ingredient.unit)")
                            .rationCaption()
                    }
                }
            }
        }
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            meal = try await env.api.meal(id: mealId).meal
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
