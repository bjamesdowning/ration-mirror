import SwiftUI

struct GalleyView: View {
    @Environment(AppEnvironment.self) private var env
    var onOpenSettings: () -> Void = {}
    @State private var model = GalleyViewModel()
    @State private var showingFilters = false
    @State private var showingAdd = false
    @State private var showingGenerate = false
    @State private var showingImport = false
    @State private var availableTags: [String] = []

    private var organizationId: String {
        env.session.activeOrganizationId ?? "unknown"
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.meals.isEmpty && model.matches.isEmpty {
                    LoadingView()
                } else if let errorMessage = model.errorMessage, model.meals.isEmpty && model.matches.isEmpty {
                    VStack(spacing: 16) {
                        ErrorBanner(message: errorMessage)
                        Button("Retry") { Task { await reload() } }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(24)
                } else if model.isMatchMode {
                    matchList
                } else if model.displayedMeals.isEmpty {
                    EmptyStateView(
                        icon: "fork.knife",
                        title: "No galley plans yet",
                        message: "Add a go-to meal or generate ideas from your Cargo."
                    )
                } else {
                    mealList
                }
            }
            .navigationTitle("Galley")
            .toolbar {
                GlobalPageToolbar(
                    hasActiveFilters: model.filters.hasActiveFilters,
                    onOptions: { showingFilters = true },
                    onOpenSettings: onOpenSettings
                )
            }
            .background(Theme.ceramic)
            .sheet(isPresented: $showingFilters) {
                FilterOptionsSheet(filters: model.filters, availableTags: availableTags)
            }
            .sheet(isPresented: $showingAdd) {
                AddMealSheet { await reload() }
            }
            .sheet(isPresented: $showingGenerate) {
                GenerateMealSheet { await reload() }
            }
            .sheet(isPresented: $showingImport) {
                ImportRecipeSheet { await reload() }
            }
            .onChange(of: model.filters.matchingEnabled) { _, _ in Task { await reload() } }
            .safeAreaInset(edge: .bottom) {
                FloatingActionBar(actions: [
                    FloatingAction(id: "add", systemImage: "plus", label: "Add", action: { showingAdd = true }, primary: true),
                    FloatingAction(id: "generate", systemImage: "sparkles", label: "Generate", action: { showingGenerate = true }),
                    FloatingAction(id: "import", systemImage: "link", label: "Import", action: { showingImport = true }),
                ])
            }
        }
        .task(id: organizationId) {
            if model.meals.isEmpty { await reload() }
            if let tags = try? await env.api.mealTags().tags {
                availableTags = tags
            }
        }
    }

    private func reload() async {
        await model.load(
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId
        )
    }

    private var mealList: some View {
        List {
            if let staleLabel = model.staleLabel {
                Text(staleLabel).rationCaption().listRowBackground(Color.clear)
            }
            ForEach(model.displayedMeals) { meal in
                NavigationLink {
                    MealDetailView(mealId: meal.id, initialMeal: meal)
                } label: {
                    MealRow(meal: meal)
                }
                .listRowBackground(Theme.surface)
                .swipeActions {
                    Button {
                        Task { await model.toggleActive(meal.id, api: env.api) }
                    } label: {
                        Label("Select", systemImage: "checkmark.circle")
                    }
                    .tint(Theme.hyperGreen)
                    Button {
                        Task { await model.cook(meal.id, api: env.api) }
                    } label: {
                        Label("Cook", systemImage: "flame")
                    }
                    Button(role: .destructive) {
                        Task {
                            await model.deleteMeal(meal.id, api: env.api, snapshots: env.snapshots, online: env.network.isOnline, organizationId: organizationId)
                        }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable { await reload() }
    }

    private var matchList: some View {
        List {
            ForEach(model.displayedMatches) { match in
                NavigationLink {
                    MealDetailView(mealId: match.meal.id, initialMeal: match.meal)
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(match.meal.name.capitalized).rationBody()
                        Text("\(Int(match.matchPercentage))% match · \(match.canMake ? "Ready" : "Missing items")")
                            .rationCaption()
                            .foregroundStyle(match.canMake ? Theme.hyperGreen : Theme.muted)
                    }
                    .padding(.vertical, 4)
                }
                .listRowBackground(Theme.surface)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable { await reload() }
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
    @State private var cookMessage: String?
    @State private var showingEdit = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let errorMessage {
                    ErrorBanner(message: errorMessage)
                }
                if let cookMessage {
                    Text(cookMessage).rationCaption().foregroundStyle(Theme.hyperGreen)
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
                HStack(spacing: 12) {
                    Button("Cook meal") { Task { await cook() } }
                        .buttonStyle(PrimaryButtonStyle())
                    Button("Edit") { showingEdit = true }
                        .buttonStyle(SecondaryButtonStyle())
                }
            }
            .padding(16)
        }
        .background(Theme.ceramic)
        .navigationTitle((meal ?? initialMeal).name.capitalized)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $showingEdit) {
            EditMealView(meal: meal ?? initialMeal) {
                await load()
            }
        }
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

    @MainActor
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

    @MainActor
    private func cook() async {
        do {
            let result = try await env.api.cookMeal(id: mealId)
            Haptics.success()
            cookMessage = "Cooked \(result.servings) servings · \(result.ingredientsDeducted) deductions"
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
