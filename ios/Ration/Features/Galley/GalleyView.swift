import SwiftUI
import Observation

@MainActor
@Observable
final class GalleyViewModel {
    enum Mode: String, CaseIterable {
        case all = "All"
        case match = "Match"
    }

    private(set) var meals: [Meal] = []
    private(set) var matches: [MealMatch] = []
    private(set) var isLoading = false
    var errorMessage: String?
    var mode: Mode = .all
    var staleLabel: String?

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if online {
            do {
                if mode == .match {
                    matches = try await api.matchMeals().matches
                } else {
                    meals = try await api.meals().meals
                    snapshots.save(MealsResponse(meals: meals), domain: SnapshotDomain.galley, organizationId: nil)
                }
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                restoreSnapshot(snapshots)
            }
        } else {
            restoreSnapshot(snapshots)
        }
        staleLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.galley)
    }

    private func restoreSnapshot(_ snapshots: SnapshotStore) {
        if let cached = snapshots.load(MealsResponse.self, domain: SnapshotDomain.galley) {
            meals = cached.payload.meals
        }
    }

    func cook(_ mealId: String, api: RationAPI) async {
        do {
            _ = try await api.cookMeal(id: mealId)
            Haptics.success()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func toggleActive(_ mealId: String, api: RationAPI) async {
        do {
            _ = try await api.toggleMealActive(id: mealId)
            Haptics.light()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct GalleyView: View {
    @Environment(AppEnvironment.self) private var env
    var onOpenSettings: () -> Void = {}
    @State private var model = GalleyViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.meals.isEmpty && model.matches.isEmpty {
                    LoadingView()
                } else if let errorMessage = model.errorMessage, model.meals.isEmpty && model.matches.isEmpty {
                    VStack(spacing: 16) {
                        ErrorBanner(message: errorMessage)
                        Button("Retry") {
                            Task {
                                await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
                            }
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(24)
                } else if model.mode == .match {
                    matchList
                } else if model.meals.isEmpty {
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
                ToolbarItem(placement: .topBarLeading) {
                    Picker("Mode", selection: $model.mode) {
                        ForEach(GalleyViewModel.Mode.allCases, id: \.self) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 160)
                    .onChange(of: model.mode) { _, _ in
                        Task {
                            await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    ProfileToolbarButton(action: onOpenSettings)
                }
            }
            .background(Theme.ceramic)
        }
        .task {
            if model.meals.isEmpty { await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline) }
        }
    }

    private var mealList: some View {
        List {
            if let staleLabel = model.staleLabel {
                Text(staleLabel).rationCaption().listRowBackground(Color.clear)
            }
            ForEach(model.meals) { meal in
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
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable {
            await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
        }
    }

    private var matchList: some View {
        List {
            ForEach(model.matches) { match in
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
        .refreshable {
            await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
        }
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
                    Button("Toggle selected") { Task { await toggle() } }
                        .buttonStyle(SecondaryButtonStyle())
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

    @MainActor
    private func toggle() async {
        do {
            let result = try await env.api.toggleMealActive(id: mealId)
            Haptics.light()
            cookMessage = result.isActive ? "Meal selected for supply sync" : "Meal deselected"
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
