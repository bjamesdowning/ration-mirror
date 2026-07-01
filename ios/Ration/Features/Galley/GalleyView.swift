import SwiftUI

struct GalleyView: View {
    @Environment(AppEnvironment.self) private var env
    var onOpenSettings: () -> Void = {}
    @State private var model = GalleyViewModel()
    @State private var showingFilters = false
    @State private var showingAddTypeChoice = false
    @State private var showingAddMeal = false
    @State private var showingAddProvision = false
    @State private var showingGenerate = false
    @State private var showingImport = false
    @State private var navigateToMealId: String?
    @State private var availableTags: [String] = []

    private var organizationId: String {
        env.session.activeOrganizationId ?? "unknown"
    }

    private var galleyCount: Int {
        model.isMatchMode ? model.displayedMatches.count : model.displayedMeals.count
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
                    if model.displayedMatches.isEmpty {
                        galleyEmptyState(isSearch: model.isSearchActive)
                    } else {
                        matchList
                    }
                } else if model.displayedMeals.isEmpty {
                    galleyEmptyState(isSearch: model.isSearchActive || !model.meals.isEmpty)
                } else {
                    mealList
                }
            }
            .navigationTitle("Galley")
            .searchable(text: $model.filters.search, prompt: "Search meals")
            .toolbar {
                GlobalPageToolbar(
                    hasActiveFilters: model.filters.hasActiveFilters,
                    syncDomain: SnapshotDomain.galley,
                    organizationId: organizationId,
                    countChip: galleyCount > 0 ? galleyCount : nil,
                    onOptions: { showingFilters = true },
                    onOpenSettings: onOpenSettings
                )
            }
            .background(Theme.ceramic)
            .sheet(isPresented: $showingFilters) {
                FilterOptionsSheet(filters: model.filters, availableTags: availableTags)
            }
            .sheet(isPresented: $showingAddTypeChoice) {
                GalleyAddTypeChoiceSheet(
                    onSelectRecipe: { showingAddMeal = true },
                    onSelectProvision: { showingAddProvision = true }
                )
            }
            .sheet(isPresented: $showingAddMeal) {
                MealFormView(mode: .create) { await reload() }
            }
            .sheet(isPresented: $showingAddProvision) {
                ProvisionFormView { await reload() }
            }
            .sheet(isPresented: $showingGenerate) {
                GenerateMealSheet { await reload() }
            }
            .sheet(isPresented: $showingImport) {
                ImportRecipeSheet(
                    onComplete: { await reload() },
                    onImportedMeal: { meal in navigateToMealId = meal.id }
                )
            }
            .navigationDestination(item: $navigateToMealId) { mealId in
                MealDetailView(mealId: mealId, initialMeal: placeholderMeal(id: mealId))
            }
            .onChange(of: model.filters.matchingEnabled) { _, _ in Task { await reload() } }
            .safeAreaInset(edge: .bottom) {
                IconFAB(systemImage: "plus.circle.fill", accessibilityLabel: "Galley actions") {
                    Button { showingAddTypeChoice = true } label: {
                        Label("Add", systemImage: "plus")
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

    private func galleyEmptyState(isSearch: Bool) -> some View {
        VStack(spacing: 16) {
            EmptyStateView(
                icon: isSearch ? "magnifyingglass" : "fork.knife",
                title: isSearch ? "No matches" : "No galley plans yet",
                message: isSearch
                    ? "Try a different search term."
                    : "Add a go-to meal or generate ideas from your Cargo."
            )
            if !isSearch {
                Button("Add") { showingAddTypeChoice = true }
                    .buttonStyle(SecondaryButtonStyle())
            }
        }
        .padding(24)
    }

    private func placeholderMeal(id: String) -> Meal {
        Meal(
            id: id,
            organizationId: "",
            name: "meal",
            domain: "food",
            type: "recipe",
            description: nil,
            directions: nil,
            equipment: nil,
            servings: 1,
            prepTime: nil,
            cookTime: nil,
            createdAt: Date(),
            updatedAt: Date(),
            tags: [],
            ingredients: []
        )
    }

    private var mealList: some View {
        List {
            ForEach(model.displayedMeals) { meal in
                NavigationLink {
                    MealDetailView(mealId: meal.id, initialMeal: meal)
                } label: {
                    MealRowView(meal: meal)
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
                    MealRowView(meal: match.meal, match: match)
                }
                .listRowBackground(Theme.surface)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable { await reload() }
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
    @State private var showingDeleteConfirm = false
    @State private var isSelectedForSupply = false
    @State private var isTogglingSupply = false
    @State private var cookUndoToken: String?
    @State private var showCookUndo = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let errorMessage {
                    ErrorBanner(message: errorMessage)
                }
                if let cookMessage {
                    Text(cookMessage).rationCaption().foregroundStyle(Theme.hyperGreen)
                }
                if isSelectedForSupply {
                    Label("On Supply list", systemImage: "checkmark.circle.fill")
                        .rationCaption()
                        .foregroundStyle(Theme.hyperGreen)
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
            }
            .padding(16)
            .padding(.bottom, 72)
        }
        .background(Theme.ceramic)
        .navigationTitle((meal ?? initialMeal).name.capitalized)
        .navigationBarTitleDisplayMode(.inline)
        .overlay(alignment: .bottom) {
            if showCookUndo, cookUndoToken != nil {
                UndoToast(
                    message: "Ingredients deducted from Cargo",
                    onUndo: { Task { await undoCook() } },
                    onDismiss: {
                        showCookUndo = false
                        cookUndoToken = nil
                    }
                )
                .padding(.bottom, 80)
            }
        }
        .safeAreaInset(edge: .bottom) {
            DetailActionFAB(
                systemImage: "ellipsis.circle.fill",
                accessibilityLabel: "Meal actions"
            ) {
                Button { Task { await cook() } } label: {
                    Label("Cook meal", systemImage: "flame")
                }
                Button { Task { await toggleSupply() } } label: {
                    Label(
                        isSelectedForSupply ? "Remove from Supply" : "Add to Supply",
                        systemImage: isSelectedForSupply ? "cart.fill.badge.minus" : "cart.badge.plus"
                    )
                }
                .disabled(isTogglingSupply)
                Button { showingEdit = true } label: {
                    Label("Edit", systemImage: "pencil")
                }
                Button(role: .destructive) { showingDeleteConfirm = true } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
        }
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
            MealFormView(mode: .edit(meal ?? initialMeal)) {
                await load()
                await loadAvailability()
            }
        }
        .confirmationDialog("Delete this meal?", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    do {
                        try await env.api.deleteMeal(mealId)
                        Haptics.light()
                        dismiss()
                    } catch {
                        errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                    }
                }
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
            let response = try await env.api.meal(id: mealId)
            meal = response.meal
            isSelectedForSupply = response.isSelectedForSupply ?? false
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
            matchResult = try await MealAvailabilityLoader.fetchMatch(
                mealId: mealId,
                servings: desiredServings,
                api: env.api
            )
        } catch {
            // Availability is supplementary — don't block the detail view.
        }
    }

    @MainActor
    private func toggleSupply() async {
        isTogglingSupply = true
        defer { isTogglingSupply = false }
        do {
            let activating = !isSelectedForSupply
            let response = try await env.api.toggleMealActive(
                id: mealId,
                servings: activating ? desiredServings : nil
            )
            isSelectedForSupply = response.isActive
            Haptics.light()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func cook() async {
        do {
            let result = try await env.api.cookMeal(id: mealId, servings: desiredServings)
            Haptics.success()
            cookMessage = "Cooked \(result.servings) servings · \(result.ingredientsDeducted) deductions"
            if let token = result.undoToken {
                cookUndoToken = token
                showCookUndo = true
            }
            await loadAvailability()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func undoCook() async {
        guard let token = cookUndoToken, env.network.isOnline else {
            showCookUndo = false
            cookUndoToken = nil
            return
        }
        showCookUndo = false
        cookUndoToken = nil
        do {
            _ = try await env.api.undoAction(token: token)
            Haptics.light()
            cookMessage = "Cook undone — Cargo restored"
            await loadAvailability()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
