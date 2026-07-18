import SwiftUI

struct GalleyView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(CopilotScrollContext.self) private var scrollContext
    var isTabActive: Bool = false
    var onOpenSettings: () -> Void = {}
    var onOpenGroupSettings: () -> Void = {}
    @State private var model = GalleyViewModel()
    @State private var showingFilters = false
    @State private var showingAddTypeChoice = false
    @State private var showingAddMeal = false
    @State private var showingAddProvision = false
    @State private var showingGenerate = false
    @State private var showingImport = false
    @State private var navigateToMealId: String?
    @State private var availableTags: [String] = []
    @State private var generateSuccessMessage: String?
    @State private var pendingCookMealId: String?
    @State private var cookConfirmationMessage: String?
    @State private var showCookConfirmation = false
    @State private var cookSuccessMessage: String?
    @State private var cookUndoToken: String?
    @State private var showCookUndo = false
    @State private var editingMeal: Meal?

    private var organizationId: String? {
        env.session.activeOrganizationId
    }

    private var loadTaskKey: String {
        "\(organizationId ?? "nil")-\(isTabActive)-\(env.lifecycle.refreshToken(forTab: 2))"
    }

    private var galleyCount: Int {
        model.listHeaderCount
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
            .searchable(text: $model.filters.search, prompt: "Search galley")
            .toolbar {
                GlobalPageToolbar(
                    hasActiveFilters: model.filters.hasActiveFilters,
                    syncDomain: SnapshotDomain.galley,
                    organizationId: organizationId,
                    isRefreshing: model.isRefreshing,
                    onOptions: { showingFilters = true },
                    onOpenGroupSettings: onOpenGroupSettings,
                    onOpenSettings: onOpenSettings
                )
            }
            .background(Theme.ceramic)
            .safeAreaInset(edge: .top, spacing: 0) {
                VStack(spacing: 0) {
                    if let message = model.errorMessage,
                       !model.meals.isEmpty || !model.matches.isEmpty {
                        ErrorBanner(message: message)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 6)
                    }
                    if model.filters.domain != nil || !model.filters.selectedTags.isEmpty {
                        ActiveFilterChipRail(
                            domain: model.filters.domain,
                            selectedTags: model.filters.selectedTags,
                            onClearDomain: { model.filters.domain = nil },
                            onClearTag: { tag in
                                model.filters.selectedTags.removeAll { $0 == tag }
                            }
                        )
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .background(Theme.ceramic)
            }
            .dataSyncBanner(
                domain: SnapshotDomain.galley,
                organizationId: organizationId,
                isRefreshing: model.isRefreshing
            )
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
                GenerateMealSheet { count in
                    await reload()
                    generateSuccessMessage = "Added \(count) meals to Galley"
                }
            }
            .sheet(isPresented: $showingImport) {
                ImportRecipeSheet(
                    onComplete: { await reload() },
                    onImportedMeal: { meal in navigateToMealId = meal.id },
                    onAddManually: {
                        showingImport = false
                        showingAddMeal = true
                    }
                )
            }
            .navigationDestination(item: $navigateToMealId) { mealId in
                MealDetailView(mealId: mealId, initialMeal: placeholderMeal(id: mealId))
            }
            .sheet(item: $editingMeal) { meal in
                MealFormView(mode: .edit(meal)) { await reload() }
            }
            .onChange(of: model.filters.matchingEnabled) { _, _ in Task { await reload() } }
            .onChange(of: model.filters.domain) { _, _ in Task { await reload() } }
            .onChange(of: model.filters.selectedTags) { _, _ in Task { await reload() } }
            .onChange(of: model.filters.search) { _, _ in
                guard let organizationId else { return }
                model.handleSearchChange(
                    api: env.api,
                    snapshots: env.snapshots,
                    online: env.network.isOnline,
                    organizationId: organizationId
                )
            }
            .onChange(of: env.cargoDataRevision) { _, _ in
                Task {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    await model.refreshAvailabilityMatches(api: env.api, online: env.network.isOnline)
                }
            }
        }
        .tabDockAction(tag: 2) {
            IconFABMenuCore(systemImage: "plus.circle.fill", accessibilityLabel: "Galley actions") {
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
        .overlay(alignment: .bottom) {
            if showCookUndo, cookUndoToken != nil {
                UndoToast(
                    message: cookSuccessMessage ?? "Ingredients deducted from Cargo",
                    onUndo: { Task { await undoCook() } },
                    onDismiss: {
                        showCookUndo = false
                        cookUndoToken = nil
                        cookSuccessMessage = nil
                    }
                )
                .padding(
                    .bottom,
                    CopilotDockLayout.toastBottomOffset(
                        isExpanded: scrollContext.isExpanded,
                        keyboardInset: 0
                    )
                )
            } else if let message = generateSuccessMessage {
                TransientSuccessToast(message: message) {
                    generateSuccessMessage = nil
                }
                .padding(
                    .bottom,
                    CopilotDockLayout.toastBottomOffset(
                        isExpanded: scrollContext.isExpanded,
                        keyboardInset: 0
                    )
                )
            } else if let message = cookSuccessMessage {
                TransientSuccessToast(message: message) {
                    cookSuccessMessage = nil
                }
                .padding(
                    .bottom,
                    CopilotDockLayout.toastBottomOffset(
                        isExpanded: scrollContext.isExpanded,
                        keyboardInset: 0
                    )
                )
            }
        }
        .task(id: loadTaskKey) {
            guard isTabActive, let organizationId else { return }
            if model.meals.isEmpty { await reload(organizationId: organizationId) }
            if let tags = try? await env.api.mealTags().tags {
                availableTags = tags
            }
        }
        .onChange(of: env.deepLinkRouter.galleyGeneratePending, initial: true) { _, pending in
            if pending {
                showingGenerate = true
                env.deepLinkRouter.acknowledgeGalleyGenerate()
            }
        }
        .onChange(of: env.deepLinkRouter.galleyImportPending, initial: true) { _, pending in
            if pending {
                showingImport = true
                env.deepLinkRouter.acknowledgeGalleyImport()
            }
        }
        .alert("Insufficient cargo", isPresented: $showCookConfirmation) {
            Button("Cook anyway") {
                Task { await confirmCookDespiteShortfall() }
            }
            Button("Cancel", role: .cancel) {
                pendingCookMealId = nil
                cookConfirmationMessage = nil
            }
        } message: {
            Text(cookConfirmationMessage ?? "Missing ingredients. Cook anyway?")
        }
    }

    private func reload(organizationId: String? = nil) async {
        guard let organizationId = organizationId ?? self.organizationId else { return }
        model.refreshOutcomes = env.refreshOutcomes
        await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.galley) {
            await model.load(
                api: env.api,
                snapshots: env.snapshots,
                online: env.network.isOnline,
                organizationId: organizationId
            )
        }
    }

    private func galleyEmptyState(isSearch: Bool) -> some View {
        CopilotTrackableScrollSurface(tab: 2, isActive: isTabActive) {
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
            if model.selectedMealCount > 0 {
                Section {
                    SupplySelectionBar(
                        count: model.selectedMealCount,
                        itemLabel: model.selectedMealCount == 1 ? "meal" : "meals",
                        contextLabel: "for Supply list",
                        isClearing: model.isClearingSelections
                    ) {
                        Task { await model.clearSelections(api: env.api) }
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if !model.isLoading {
                ListCountHeader(count: galleyCount, isLoading: model.isSearching)
            }
            Section {
                ForEach(model.displayedMeals) { meal in
                    MealRowView(
                        meal: meal,
                        match: env.network.isOnline ? model.match(for: meal.id) : nil,
                        showMatchRing: env.network.isOnline,
                        isSelectedForSupply: model.isMealSelected(meal.id),
                        isInitiallySelectedForSupply: model.isMealSelected(meal.id)
                    )
                    .listRowBackground(Theme.surface)
                    .inventoryLeadingSwipeActions(
                        isSelectedForSupply: model.isMealSelected(meal.id),
                        onSupplyToggle: {
                            Task { await model.toggleActive(meal.id, api: env.api) }
                        },
                        onEdit: { editingMeal = meal }
                    )
                    .galleyTrailingSwipeActions(
                        onCook: { Task { await handleCook(mealId: meal.id) } },
                        onDelete: {
                            Task {
                                guard let organizationId else { return }
                                await model.deleteMeal(
                                    meal.id,
                                    api: env.api,
                                    snapshots: env.snapshots,
                                    online: env.network.isOnline,
                                    organizationId: organizationId
                                )
                            }
                        }
                    )
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .refreshable { await reload() }
        .scrollDismissesKeyboard(.interactively)
        .copilotDockScrollMargins()
        .copilotScrollTracked(tab: 2, isActive: isTabActive)
    }

    private var matchList: some View {
        List {
            if model.selectedMealCount > 0 {
                Section {
                    SupplySelectionBar(
                        count: model.selectedMealCount,
                        itemLabel: model.selectedMealCount == 1 ? "meal" : "meals",
                        contextLabel: "for Supply list",
                        isClearing: model.isClearingSelections
                    ) {
                        Task { await model.clearSelections(api: env.api) }
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if !model.isLoading {
                ListCountHeader(count: galleyCount, isLoading: model.isSearching)
            }
            Section {
                ForEach(model.displayedMatches) { match in
                    MealRowView(
                        meal: match.meal,
                        match: match,
                        isSelectedForSupply: model.isMealSelected(match.meal.id),
                        isInitiallySelectedForSupply: model.isMealSelected(match.meal.id)
                    )
                    .listRowBackground(Theme.surface)
                    .inventoryLeadingSwipeActions(
                        isSelectedForSupply: model.isMealSelected(match.meal.id),
                        onSupplyToggle: {
                            Task { await model.toggleActive(match.meal.id, api: env.api) }
                        },
                        onEdit: { editingMeal = match.meal }
                    )
                    .galleyTrailingSwipeActions(
                        onCook: { Task { await handleCook(mealId: match.meal.id) } },
                        onDelete: {
                            Task {
                                guard let organizationId else { return }
                                await model.deleteMeal(
                                    match.meal.id,
                                    api: env.api,
                                    snapshots: env.snapshots,
                                    online: env.network.isOnline,
                                    organizationId: organizationId
                                )
                            }
                        }
                    )
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .refreshable { await reload() }
        .scrollDismissesKeyboard(.interactively)
        .copilotDockScrollMargins()
        .copilotScrollTracked(tab: 2, isActive: isTabActive)
    }

    private func handleCook(mealId: String, servings: Int? = nil, confirmInsufficient: Bool = false) async {
        switch await model.cook(
            mealId,
            servings: servings,
            confirmInsufficient: confirmInsufficient,
            api: env.api
        ) {
        case .success(let undoToken, let cookedServings, let ingredientsDeducted, let partialCook, let skipped):
            env.notifyCargoDataChanged()
            cookSuccessMessage = GalleyViewModel.cookSuccessMessage(
                servings: cookedServings,
                ingredientsDeducted: ingredientsDeducted,
                partialCook: partialCook,
                skippedIngredients: skipped
            )
            // Always replace prior undo state so a cook without a token cannot
            // leave a stale UndoToast bound to an older deduction.
            cookUndoToken = undoToken
            showCookUndo = undoToken != nil
        case .needsConfirmation(let missing):
            pendingCookMealId = mealId
            cookConfirmationMessage = missingIngredientsMessage(missing)
            showCookConfirmation = true
        case .failed:
            break
        }
    }

    private func undoCook() async {
        guard let token = cookUndoToken else { return }
        guard env.network.isOnline else {
            model.errorMessage = "Undo requires a network connection."
            return
        }
        do {
            _ = try await env.api.undoAction(token: token)
            showCookUndo = false
            cookUndoToken = nil
            Haptics.light()
            cookSuccessMessage = "Cook undone — Cargo restored"
            env.notifyCargoDataChanged()
        } catch {
            model.errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func confirmCookDespiteShortfall() async {
        guard let mealId = pendingCookMealId else { return }
        pendingCookMealId = nil
        cookConfirmationMessage = nil
        showCookConfirmation = false
        await handleCook(mealId: mealId, confirmInsufficient: true)
    }

    private func missingIngredientsMessage(_ missing: [MissingIngredientDetail]) -> String {
        let lines = missing.map { ingredient in
            let required = QuantityPresenter.present(
                quantity: ingredient.required,
                unit: ingredient.unit,
                ingredientName: ingredient.name,
                mode: env.unitDisplayMode.mode
            )
            let available = QuantityPresenter.present(
                quantity: ingredient.available,
                unit: ingredient.unit,
                ingredientName: ingredient.name,
                mode: env.unitDisplayMode.mode
            )
            return "\(ingredient.name.capitalized): need \(required), have \(available)"
        }
        return "Missing \(missing.count) ingredient\(missing.count == 1 ? "" : "s").\n\(lines.joined(separator: "\n"))\n\nCook anyway and deduct what's available?"
    }
}

struct MealDetailView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(CopilotScrollContext.self) private var scrollContext
    let mealId: String
    let initialMeal: Meal
    var isInitiallySelectedForSupply = false
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
    @State private var cookConfirmationMessage: String?
    @State private var showCookConfirmation = false
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
        }
        .scrollDismissesKeyboard(.interactively)
        .copilotDockScrollMargins()
        .copilotScrollTracked(tab: scrollContext.activeTab, isActive: true)
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
                .padding(
                    .bottom,
                    CopilotDockLayout.toastBottomOffset(
                        isExpanded: scrollContext.isExpanded,
                        keyboardInset: 0
                    )
                )
            }
        }
        .tabDockAction(tag: scrollContext.activeTab) {
            IconFABMenuCore(systemImage: "ellipsis.circle.fill", accessibilityLabel: "Meal actions") {
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
                .destructiveDeleteTint()
            }
        }
        .task {
            isSelectedForSupply = isInitiallySelectedForSupply
            let base = max(initialMeal.servings ?? 1, 1)
            desiredServings = base
            await load()
            await loadAvailability()
        }
        .onChange(of: desiredServings) { _, _ in
            Task { await loadAvailability() }
        }
        .onChange(of: isSelectedForSupply) { _, _ in
            env.tabDock.bumpContentEpoch()
        }
        .onChange(of: isTogglingSupply) { _, _ in
            env.tabDock.bumpContentEpoch()
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
        .alert("Insufficient cargo", isPresented: $showCookConfirmation) {
            Button("Cook anyway") {
                Task { await cook(confirmInsufficient: true) }
            }
            Button("Cancel", role: .cancel) {
                cookConfirmationMessage = nil
            }
        } message: {
            Text(cookConfirmationMessage ?? "Missing ingredients. Cook anyway?")
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
                .accessibilityLabel("Decrease servings")
                Text("\(desiredServings)")
                    .rationBody()
                    .frame(minWidth: 32)
                    .accessibilityLabel("\(desiredServings) servings")
                Button { if desiredServings < 99 { desiredServings += 1 } } label: {
                    Image(systemName: "plus.circle")
                }
                .accessibilityLabel("Increase servings")
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
                            ingredientNameLabel(row.ingredient)
                            let scaled = MealAvailabilityEngine.scaledQuantity(
                                row.ingredient.quantity,
                                baseServings: max(meal.servings ?? 1, 1),
                                desiredServings: desiredServings
                            )
                            DisplayQuantityLabel(
                                quantity: scaled,
                                unit: row.ingredient.unit,
                                baseQuantity: row.ingredient.baseQuantity.map {
                                    MealAvailabilityEngine.scaledQuantity(
                                        $0,
                                        baseServings: max(meal.servings ?? 1, 1),
                                        desiredServings: desiredServings
                                    )
                                },
                                baseUnit: row.ingredient.baseUnit,
                                ingredientName: row.ingredient.ingredientName
                            )
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

    @ViewBuilder
    private func ingredientNameLabel(_ ingredient: MealIngredient) -> some View {
        if let cargoId = CargoLinkResolver.resolveCargoId(for: ingredient) {
            NavigationLink {
                CargoDetailView(itemId: cargoId)
            } label: {
                Text(ingredient.ingredientName.capitalized)
                    .rationBody()
                    .foregroundStyle(Theme.carbon)
            }
            .buttonStyle(.plain)
        } else {
            Text(ingredient.ingredientName.capitalized).rationBody()
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
    private func cook(confirmInsufficient: Bool = false) async {
        do {
            let result = try await env.api.cookMeal(
                id: mealId,
                servings: desiredServings,
                confirmInsufficient: confirmInsufficient ? true : nil
            )
            if result.requiresConfirmation == true,
               let missing = result.missingIngredients,
               !missing.isEmpty,
               !confirmInsufficient
            {
                cookConfirmationMessage = missingIngredientsMessage(missing)
                showCookConfirmation = true
                return
            }
            Haptics.success()
            cookMessage = GalleyViewModel.cookSuccessMessage(
                servings: result.servings ?? desiredServings,
                ingredientsDeducted: result.ingredientsDeducted ?? 0,
                partialCook: result.partialCook ?? false,
                skippedIngredients: result.skippedIngredients ?? []
            )
            // Always replace prior undo state so a cook without a token cannot
            // leave a stale UndoToast bound to an older deduction.
            cookUndoToken = result.undoToken
            showCookUndo = result.undoToken != nil
            env.notifyCargoDataChanged()
            await loadAvailability()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func missingIngredientsMessage(_ missing: [MissingIngredientDetail]) -> String {
        let lines = missing.map { ingredient in
            let required = QuantityPresenter.present(
                quantity: ingredient.required,
                unit: ingredient.unit,
                ingredientName: ingredient.name,
                mode: env.unitDisplayMode.mode
            )
            let available = QuantityPresenter.present(
                quantity: ingredient.available,
                unit: ingredient.unit,
                ingredientName: ingredient.name,
                mode: env.unitDisplayMode.mode
            )
            return "\(ingredient.name.capitalized): need \(required), have \(available)"
        }
        return "Missing \(missing.count) ingredient\(missing.count == 1 ? "" : "s").\n\(lines.joined(separator: "\n"))\n\nCook anyway and deduct what's available?"
    }

    @MainActor
    private func undoCook() async {
        guard let token = cookUndoToken else { return }
        guard env.network.isOnline else {
            errorMessage = "Undo requires a network connection."
            return
        }
        do {
            _ = try await env.api.undoAction(token: token)
            showCookUndo = false
            cookUndoToken = nil
            Haptics.light()
            cookMessage = "Cook undone — Cargo restored"
            await loadAvailability()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
