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
    @State private var paywallContext: PaywallContext?

    private var organizationId: String? {
        env.session.activeOrganizationId
    }

    private var loadTaskKey: String {
        let tags = model.filters.selectedTags.sorted().joined(separator: ",")
        return [
            organizationId ?? "nil",
            isTabActive ? "1" : "0",
            "\(env.lifecycle.refreshToken(forTab: .galley))",
            model.filters.matchingEnabled ? "match" : "list",
            model.filters.domain?.rawValue ?? "",
            tags,
        ].joined(separator: "|")
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
            .sheet(item: $paywallContext) { ctx in
                PaywallView(context: ctx)
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
                model.scheduleAvailabilityRefresh(api: env.api, online: env.network.isOnline)
            }
        }
        .tabDockAction(tag: .galley) {
            IconFABMenuCore(systemImage: "plus.circle.fill", accessibilityLabel: "Galley actions") {
                Button { showingAddTypeChoice = true } label: {
                    Label("Add", systemImage: "plus")
                }
                if env.session.clientFlags.isAiGenerateMealEnabled {
                    Button { showingGenerate = true } label: {
                        Label("Generate meal", systemImage: "sparkles")
                    }
                }
                if env.session.clientFlags.isAiImportUrlEnabled {
                    Button { showingImport = true } label: {
                        Label("Import recipe", systemImage: "link")
                    }
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
            await reload(organizationId: organizationId)
            if let tags = try? await env.api.mealTags().tags {
                availableTags = tags
            }
        }
        .onDisappear { model.cancelLoads() }
        .onChange(of: env.deepLinkRouter.galleyGeneratePending, initial: true) { _, pending in
            if pending {
                if env.session.clientFlags.isAiGenerateMealEnabled {
                    showingGenerate = true
                }
                env.deepLinkRouter.acknowledgeGalleyGenerate()
            }
        }
        .onChange(of: env.deepLinkRouter.galleyImportPending, initial: true) { _, pending in
            if pending {
                if env.session.clientFlags.isAiImportUrlEnabled {
                    showingImport = true
                }
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
        CopilotTrackableScrollSurface(tab: .galley, isActive: isTabActive) {
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
                        model.runMutation { await model.clearSelections(api: env.api) }
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if !model.isLoading {
                ListCountHeader(count: galleyCount, isLoading: model.isSearching)
                if !env.session.isCrewMember {
                    CapacityMeter(
                        label: "meals",
                        current: model.mealTotal,
                        limit: TierLimits.freeMaxMeals
                    ) {
                        paywallContext = PaywallContext(
                            trigger: .capacity,
                            resource: "meals",
                            current: model.mealTotal,
                            limit: TierLimits.freeMaxMeals
                        )
                    }
                }
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
                            model.runMutation { await model.toggleActive(meal.id, api: env.api) }
                        },
                        onEdit: { editingMeal = meal }
                    )
                    .galleyTrailingSwipeActions(
                        onCook: { Task { await handleCook(mealId: meal.id) } },
                        onDelete: {
                            model.runMutation {
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
        .copilotScrollTracked(tab: .galley, isActive: isTabActive)
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
                        model.runMutation { await model.clearSelections(api: env.api) }
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if !model.isLoading {
                ListCountHeader(count: galleyCount, isLoading: model.isSearching)
                if !env.session.isCrewMember {
                    CapacityMeter(
                        label: "meals",
                        current: model.mealTotal,
                        limit: TierLimits.freeMaxMeals
                    ) {
                        paywallContext = PaywallContext(
                            trigger: .capacity,
                            resource: "meals",
                            current: model.mealTotal,
                            limit: TierLimits.freeMaxMeals
                        )
                    }
                }
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
                            model.runMutation { await model.toggleActive(match.meal.id, api: env.api) }
                        },
                        onEdit: { editingMeal = match.meal }
                    )
                    .galleyTrailingSwipeActions(
                        onCook: { Task { await handleCook(mealId: match.meal.id) } },
                        onDelete: {
                            model.runMutation {
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
        .copilotScrollTracked(tab: .galley, isActive: isTabActive)
    }

    private func handleCook(mealId: String, servings: Int? = nil, confirmInsufficient: Bool = false) async {
        switch await model.runCook(
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
            _ = try await MutationRetry.once {
                try await env.api.undoAction(token: token)
            }
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
