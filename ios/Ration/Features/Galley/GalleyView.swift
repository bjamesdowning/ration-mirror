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
                    syncDomain: SnapshotDomain.galley,
                    organizationId: organizationId,
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
                IconFAB(systemImage: "plus.circle.fill", accessibilityLabel: "Galley actions") {
                    Button { showingAdd = true } label: {
                        Label("Add meal", systemImage: "plus")
                    }
                    Button { showingGenerate = true } label: {
                        Label("Generate meal", systemImage: "sparkles")
                    }
                    Button { showingImport = true } label: {
                        Label("Import recipe", systemImage: "link")
                    }
                }
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
    @State private var matchResult: MealMatch?
    @State private var desiredServings: Int = 1
    @State private var isLoading = false
    @State private var isLoadingAvailability = false
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
                servingsStepper(baseServings: max(displayMeal.servings ?? 1, 1))
                if !displayMeal.ingredients.isEmpty {
                    ingredients(displayMeal)
                }
                if let directions = displayMeal.directions, !directions.isEmpty {
                    GlassCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Directions").rationHeadline()
                            DirectionsStepsView(steps: DirectionsParser.parseDirections(directions))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                HStack(spacing: 12) {
                    Button("Cook meal") { Task { await cook() } }
                        .buttonStyle(SecondaryButtonStyle())
                    Button("Edit") { showingEdit = true }
                        .buttonStyle(SecondaryButtonStyle())
                }
            }
            .padding(16)
        }
        .background(Theme.ceramic)
        .navigationTitle((meal ?? initialMeal).name.capitalized)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            let base = max(initialMeal.servings ?? 1, 1)
            desiredServings = base
            await load()
            await loadAvailability()
        }
        .onChange(of: desiredServings) { _, _ in
            Task { await loadAvailability() }
        }
        .sheet(isPresented: $showingEdit) {
            EditMealView(meal: meal ?? initialMeal) {
                await load()
                await loadAvailability()
            }
        }
    }

    private func servingsStepper(baseServings: Int) -> some View {
        GlassCard {
            HStack {
                Text("Servings").rationHeadline()
                Spacer()
                Button { if desiredServings > 1 { desiredServings -= 1 } } label: {
                    Image(systemName: "minus.circle")
                }
                Text("\(desiredServings)").rationBody().frame(minWidth: 32)
                Button { if desiredServings < 99 { desiredServings += 1 } } label: {
                    Image(systemName: "plus.circle")
                }
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

    private func ingredients(_ meal: Meal) -> some View {
        let rows = MealAvailabilityEngine.availabilityRows(
            meal: meal,
            match: matchResult,
            desiredServings: desiredServings
        )
        return GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Ingredients").rationHeadline()
                    if isLoadingAvailability {
                        ProgressView().scaleEffect(0.8)
                    }
                }
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    HStack(alignment: .top, spacing: 10) {
                        Circle()
                            .fill(color(for: row.status))
                            .frame(width: 8, height: 8)
                            .padding(.top, 6)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.ingredient.ingredientName.capitalized).rationBody()
                            let scaled = MealAvailabilityEngine.scaledQuantity(
                                row.ingredient.quantity,
                                baseServings: max(meal.servings ?? 1, 1),
                                desiredServings: desiredServings
                            )
                            Text("\(scaled.formatted()) \(row.ingredient.unit)")
                                .rationCaption()
                            if let subtitle = row.subtitle {
                                Text(subtitle).rationCaption().foregroundStyle(Theme.muted)
                            }
                        }
                        Spacer()
                    }
                }
            }
        }
    }

    private func color(for status: IngredientAvailabilityStatus) -> Color {
        switch status {
        case .available: Theme.hyperGreen
        case .partial: Theme.warning
        case .missing: Theme.danger
        }
    }

    @MainActor
    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            meal = try await env.api.meal(id: mealId).meal
            if let s = meal?.servings, s > 0 { desiredServings = s }
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func loadAvailability() async {
        isLoadingAvailability = true
        defer { isLoadingAvailability = false }
        do {
            let response = try await env.api.matchMeals(
                mode: "strict",
                limit: 20,
                servings: desiredServings
            )
            matchResult = response.matches.first { $0.meal.id == mealId }
                ?? response.matches.first { $0.meal.name.lowercased() == (meal ?? initialMeal).name.lowercased() }
        } catch {
            // Availability is supplementary — don't block the detail view.
        }
    }

    @MainActor
    private func cook() async {
        do {
            let result = try await env.api.cookMeal(id: mealId, servings: desiredServings)
            Haptics.success()
            cookMessage = "Cooked \(result.servings) servings · \(result.ingredientsDeducted) deductions"
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
