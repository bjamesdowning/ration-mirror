import SwiftUI

struct MealDetailView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(CopilotScrollContext.self) private var scrollContext
    @Environment(\.currentMainTab) private var currentMainTab
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
    @State private var showingFuel = false
    @State private var fuelPresentation = FuelAddPresentation()
    @State private var pendingFuel: FuelAmountSubmission?
    @State private var fuelConfirmationMessage: String?
    @State private var showFuelConfirmation = false
    @State private var showingDeleteConfirm = false
    @State private var isSelectedForSupply = false
    @State private var isTogglingSupply = false
    @State private var cookUndoToken: String?
    @State private var showCookUndo = false
    @State private var undoToastMessage = "Ingredients deducted from Cargo"
    @State private var cookConfirmationMessage: String?
    @State private var showCookConfirmation = false
    @State private var pendingEatEntry: ManifestEntry?
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
                AllergenWarningBadge(
                    triggered: AllergenDetector.detect(
                        ingredientNames: displayMeal.ingredients.map(\.ingredientName),
                        userAllergens: env.launch.userSettings?.allergens ?? []
                    )
                )
                header(displayMeal)
                servingsStepper(baseServings: max(displayMeal.servings ?? 1, 1))
                NutritionDetailSection(
                    title: "Nutrition · Per recipe serving",
                    nutrients: displayMeal.nutrition?.displayNutrients,
                    provenance: "Meal",
                    coverage: displayMeal.nutrition?.coverage,
                    emptyMessage: "No nutrition profile yet. Ensure ingredients have nutrition, then save the meal to recompute."
                )
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
        .copilotScrollTracked(tab: .galley, isActive: true)
        .background(Theme.ceramic)
        .navigationTitle(MealNameDisplay.text((meal ?? initialMeal).name))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingFuel) {
            PlanFuelAmountSheet(
                title: FuelAmountEntry.title(
                    planFuelActionsEnabled: env.session.clientFlags.isPlanFuelActionsEnabled
                ),
                unit: "serving",
                start: 1,
                energy: { servings in
                    guard let per = (meal ?? initialMeal).nutrition?.perServing?.energyKcal else {
                        return nil
                    }
                    return per * servings
                }
            ) { submission in
                try await self.logMealFuel(submission)
            }
        }
        .overlay(alignment: .bottom) {
            if showCookUndo, cookUndoToken != nil {
                UndoToast(
                    message: undoToastMessage,
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
        .tabDockAction(tag: .galley, layer: .detail, isActive: currentMainTab == .galley) {
            IconFABMenuCore(systemImage: "ellipsis.circle.fill", accessibilityLabel: "Meal actions") {
                ForEach(MealOverflowMenu.ordered(), id: \.self) { action in
                    mealOverflowButton(action)
                }
            }
        }
        .task {
            isSelectedForSupply = isInitiallySelectedForSupply
            let base = max(initialMeal.servings ?? 1, 1)
            desiredServings = base
            await load()
        }
        .task(id: desiredServings) {
            await loadAvailability()
        }
        .onChange(of: meal != nil) { _, _ in
            env.tabDock.bumpContentEpoch()
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
        .alert("Insufficient cargo", isPresented: $showFuelConfirmation) {
            Button("Add anyway") {
                fuelPresentation.confirmShortPantry()
                Task { await confirmFuelDespiteShortfall() }
            }
            Button("Cancel", role: .cancel) {
                fuelPresentation.declineShortPantry()
                pendingFuel = nil
                fuelConfirmationMessage = nil
            }
        } message: {
            Text(fuelConfirmationMessage ?? "Missing ingredients. Add to Fuel anyway?")
        }
        .sheet(item: $pendingEatEntry) { entry in
            ManifestPlateUpSheet(
                entry: entry,
                onSave: { servings, notes, amount, unit in
                    await logServing(
                        entry: entry,
                        servings: servings,
                        notes: notes,
                        amount: amount,
                        unit: unit
                    )
                }
            )
        }
    }

    @ViewBuilder
    private func mealOverflowButton(_ action: MealOverflowAction) -> some View {
        switch action {
        case .delete:
            Button(role: .destructive) { showingDeleteConfirm = true } label: {
                Label("Delete", systemImage: "trash")
            }
            .destructiveDeleteTint()
        case .edit:
            Button { showingEdit = true } label: {
                Label("Edit", systemImage: "pencil")
            }
            .disabled(meal == nil && initialMeal.organizationId.isEmpty)
        case .cook:
            Button {
                if env.session.clientFlags.isPlanFuelActionsEnabled {
                    fuelPresentation.begin()
                    showingFuel = true
                } else {
                    Task { await cook() }
                }
            } label: {
                Label(
                    env.session.clientFlags.isPlanFuelActionsEnabled ? "Add to Fuel" : "Cook meal",
                    systemImage: env.session.clientFlags.isPlanFuelActionsEnabled ? "flame.fill" : "flame"
                )
            }
        case .manifest:
            Button {
                env.openDeepLink(
                    .manifestAddEntry(
                        mealId: mealId,
                        date: ManifestDateHelpers.todayISO()
                    )
                )
            } label: {
                Label("Add to Manifest", systemImage: "calendar")
            }
        case .supply:
            Button { Task { await toggleSupply() } } label: {
                Label(
                    isSelectedForSupply ? "Remove from Supply" : "Add to Supply",
                    systemImage: isSelectedForSupply ? "cart.fill.badge.minus" : "cart.badge.plus"
                )
            }
            .disabled(isTogglingSupply)
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
                Text(MealNameDisplay.text(meal.name)).rationTitle()
                if let description = meal.description, !description.isEmpty {
                    Text(description).rationBody()
                }
                if let sourceUrl = meal.sourceUrl, let url = URL(string: sourceUrl) {
                    Link(destination: url) {
                        Label("View source", systemImage: "arrow.up.right.square")
                    }
                    .font(Typography.caption())
                    .foregroundStyle(Theme.hyperGreen)
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
            desiredServings: desiredServings,
            mode: env.unitDisplayMode.mode
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
            Button {
                env.openDeepLink(.cargoItem(id: cargoId))
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
            let response = try await MutationRetry.once {
                try await env.api.toggleMealActive(
                    id: mealId,
                    servings: activating ? desiredServings : nil
                )
            }
            isSelectedForSupply = response.isActive
            Haptics.light()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func logMealFuel(_ submission: FuelAmountSubmission) async throws {
        let attempt = fuelPresentation.submit()
        let result = try await env.api.addMealToFuel(
            id: mealId,
            servings: submission.quantity,
            operationKey: attempt.operationKey,
            confirmInsufficient: attempt.confirmInsufficient,
            notes: submission.notes,
            energyKcal: submission.energyKcal
        )
        switch result {
        case .saved(_, _, let undoToken):
            env.notifyCargoDataChanged()
            if let undoToken, !undoToken.isEmpty {
                undoToastMessage = "Serving logged"
                cookUndoToken = undoToken
                showCookUndo = true
            }
        case .needsConfirmation(let missing):
            let message = FuelAddShortPantry.message(missing, mode: env.unitDisplayMode.mode)
            pendingFuel = submission
            fuelConfirmationMessage = message
            showFuelConfirmation = true
            throw FuelNeedsConfirmation(message: message)
        }
    }

    @MainActor
    private func confirmFuelDespiteShortfall() async {
        guard let submission = pendingFuel else { return }
        do {
            try await logMealFuel(submission)
            showingFuel = false
            pendingFuel = nil
            fuelConfirmationMessage = nil
        } catch is FuelNeedsConfirmation {
        } catch {
            fuelConfirmationMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            showFuelConfirmation = true
        }
    }

    @MainActor
    private func cook(confirmInsufficient: Bool = false) async {
        do {
            let bridgeDate = ManifestDateHelpers.todayISO()
            let bridgeHour = Calendar.current.component(.hour, from: Date())
            let result = try await MutationRetry.once {
                try await env.api.cookMeal(
                    id: mealId,
                    servings: desiredServings,
                    confirmInsufficient: confirmInsufficient ? true : nil,
                    date: bridgeDate,
                    localHour: bridgeHour
                )
            }
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
            var message = GalleyViewModel.cookSuccessMessage(
                servings: result.servings ?? desiredServings,
                ingredientsDeducted: result.ingredientsDeducted ?? 0,
                partialCook: result.partialCook ?? false,
                skippedIngredients: result.skippedIngredients ?? []
            )
            if result.bridgedToManifest == true {
                message += " · Added to today's Manifest"
            }
            cookMessage = message
            undoToastMessage = "Ingredients deducted from Cargo"
            cookUndoToken = result.undoToken
            showCookUndo = result.undoToken != nil
            env.notifyCargoDataChanged()
            await loadAvailability()
            if result.offerPersonalLog == true, let bridged = result.entry {
                pendingEatEntry = bridged.asManifestEntry()
            }
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func logServing(
        entry: ManifestEntry,
        servings: Double,
        notes: String? = nil,
        amount: Double? = nil,
        unit: IntakeLoggedUnit? = nil
    ) async -> String? {
        do {
            let result = try await env.api.upsertManifestIntake(
                entryId: entry.id,
                servings: servings,
                idempotencyKey: UUID().uuidString,
                notes: notes,
                amount: amount,
                unit: unit
            )
            if let dayTotals = result.dayTotals, !dayTotals.isEmpty {
                env.configureNutritionScope()
                let day = LocalDay.todayISO()
                env.nutrition.applyDayTotals(dayTotals, forRange: day, to: day)
            }
            Haptics.success()
            cookMessage = "Serving logged"
            return nil
        } catch {
            if let apiError = error as? APIError, apiError.isNutritionConsentRequired {
                return "Allow personal serving logs to continue."
            }
            if let apiError = error as? APIError, apiError.isNutritionUpdating {
                return apiError.errorDescription
                    ?? "Nutrition totals are still updating. Try again shortly."
            }
            return (error as? APIError)?.errorDescription ?? error.localizedDescription
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
