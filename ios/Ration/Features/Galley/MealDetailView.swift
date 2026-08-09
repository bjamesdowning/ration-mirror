import SwiftUI

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
    @State private var pendingEatEntry: ManifestEntry?
    @State private var intakeConsentGranted = false
    @Environment(\.dismiss) private var dismiss

    private var cookLogSplitEnabled: Bool {
        env.session.clientFlags.isNutritionCookLogSplitEnabled
    }

    private var offerEatEnabled: Bool {
        cookLogSplitEnabled && env.session.clientFlags.isNutritionManifestEnabled
    }

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
                if env.session.clientFlags.isNutritionEngineEnabled {
                    NutritionDetailSection(
                        title: "Nutrition (per serving)",
                        nutrients: displayMeal.nutrition?.displayNutrients,
                        provenance: "Meal",
                        coverage: displayMeal.nutrition?.coverage,
                        emptyMessage: "No nutrition profile yet. Ensure ingredients have nutrition, then save the meal to recompute."
                    )
                }
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
                if cookLogSplitEnabled {
                    Button {
                        env.openDeepLink(
                            .manifestAddEntry(
                                mealId: mealId,
                                date: ManifestDateHelpers.todayISO()
                            )
                        )
                    } label: {
                        Label("Add to Manifest", systemImage: "calendar.badge.plus")
                    }
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
        }
        .task(id: desiredServings) {
            await loadAvailability()
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
        .sheet(item: $pendingEatEntry) { entry in
            ManifestPlateUpSheet(
                entry: entry,
                hasIntakeConsent: intakeConsentGranted,
                onSave: { servings in
                    await logServing(entry: entry, servings: servings)
                }
            )
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
    private func cook(confirmInsufficient: Bool = false) async {
        do {
            let bridgeDate = cookLogSplitEnabled ? ManifestDateHelpers.todayISO() : nil
            let bridgeHour = cookLogSplitEnabled
                ? Calendar.current.component(.hour, from: Date())
                : nil
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
            cookUndoToken = result.undoToken
            showCookUndo = result.undoToken != nil
            env.notifyCargoDataChanged()
            await loadAvailability()
            if offerEatEnabled,
               result.offerPersonalLog == true,
               let bridged = result.entry
            {
                pendingEatEntry = bridged.asManifestEntry()
            }
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func logServing(entry: ManifestEntry, servings: Double) async -> String? {
        do {
            let result = try await env.api.upsertManifestIntake(
                entryId: entry.id,
                servings: servings,
                idempotencyKey: UUID().uuidString
            )
            if result.intakeConsentGranted == true {
                intakeConsentGranted = true
            }
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
