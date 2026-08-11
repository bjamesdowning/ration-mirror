import SwiftUI
import Observation

struct ManifestView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(CopilotScrollContext.self) private var scrollContext
    var isTabActive: Bool = false
    var onOpenSettings: () -> Void = {}
    var onOpenGroupSettings: () -> Void = {}
    var onOpenNutritionGoals: () -> Void = {}
    var onPlanWeekComplete: (Int) -> Void = { _ in }
    @State private var model = ManifestViewModel()
    @State private var showingAddEntry = false
    @State private var addEntryPrefillMealId: String?
    @State private var showingPlanWeek = false
    @State private var showingOptions = false
    @State private var showingJumpCalendar = false
    @State private var paywallContext: PaywallContext?
    @State private var pendingUndo: ManifestUndoToast?
    /// Shared by legacy Consume and split Cook — both deduct Cargo and need the same
    /// "insufficient stock, cook/consume anyway?" confirmation flow.
    @State private var pendingPrepareEntry: ManifestEntry?
    @State private var prepareConfirmationMessage: String?
    @State private var showPrepareConfirmation = false
    @State private var pendingEatEntry: ManifestEntry?

    private var organizationId: String? {
        env.session.activeOrganizationId
    }

    private var userId: String? {
        env.session.session?.user.id
    }

    private var loadTaskKey: String {
        "\(userId ?? "nil")-\(organizationId ?? "nil")-\(isTabActive)-\(env.lifecycle.refreshToken(forTab: .manifest))"
    }

    private var manifestEntryCount: Int {
        guard let manifest = model.manifest else { return 0 }
        let end = ManifestDateHelpers.addDays(model.rangeStart, days: max(model.calendarSpan - 1, 0))
        return manifest.entries.filter { $0.date >= model.rangeStart && $0.date <= end }.count
    }

    private var todayNavigationAnchor: String {
        ManifestDateHelpers.todayNavigationAnchor(
            calendarSpan: model.calendarSpan,
            weekStartPref: model.weekStartPref
        )
    }

    private var showTodayToolbarButton: Bool {
        model.rangeStart != todayNavigationAnchor
    }

    private func jumpToToday() {
        guard let organizationId, let userId else { return }
        model.requestNavigateWeek(
            to: todayNavigationAnchor,
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId,
            userId: userId,
            nutrition: env.nutrition
        )
    }

    var body: some View {
        manifestNavigationStack
            .tabDockAction(tag: .manifest) {
                IconFABMenuCore(
                    systemImage: "plus.circle.fill",
                    accessibilityLabel: "Manifest actions",
                    disabled: !env.network.isOnline
                ) {
                    Button { showingAddEntry = true } label: {
                        Label("Add entry", systemImage: "plus")
                    }
                    .disabled(!env.network.isOnline)
                    if env.session.clientFlags.isAiPlanWeekEnabled {
                        Button { showingPlanWeek = true } label: {
                            Label("Plan week", systemImage: "sparkles")
                        }
                        .disabled(!env.network.isOnline)
                    }
                }
            }
            .overlay(alignment: .bottom) {
                if let toast = pendingUndo {
                    UndoToast(
                        message: toast.message,
                        onUndo: { Task { await performUndo(toast.token) } },
                        onDismiss: { pendingUndo = nil }
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
            .task(id: loadTaskKey) {
                guard isTabActive, let organizationId else { return }
                let manifestSettings = env.launch.userSettings?.manifestSettings
                model.prepareForLoad(
                    organizationId: organizationId,
                    calendarSpan: manifestSettings?.calendarSpan ?? 7,
                    weekStartPref: manifestSettings?.weekStart ?? "sunday"
                )
                await reload(organizationId: organizationId)
                model.share.loadStatus { try await env.api.manifestShareStatus() }
            }
            .onChange(of: env.deepLinkRouter.manifestPlanWeekPending, initial: true) { _, pending in
                if pending {
                    if env.session.clientFlags.isAiPlanWeekEnabled {
                        showingPlanWeek = true
                    }
                    env.deepLinkRouter.acknowledgeManifestPlanWeek()
                }
            }
            .onChange(of: env.deepLinkRouter.manifestAddEntryPending, initial: true) { _, pending in
                guard let pending else { return }
                guard env.session.clientFlags.isNutritionCookLogSplitEnabled else {
                    env.deepLinkRouter.acknowledgeManifestAddEntry()
                    return
                }
                model.selectedDay = pending.date
                addEntryPrefillMealId = pending.mealId
                showingAddEntry = true
                env.deepLinkRouter.acknowledgeManifestAddEntry()
            }
            .refreshable { await reload() }
            .alert("Insufficient cargo", isPresented: $showPrepareConfirmation) {
                Button("Continue anyway") {
                    Task { await confirmPrepareDespiteShortfall() }
                }
                Button("Cancel", role: .cancel) {
                    pendingPrepareEntry = nil
                    prepareConfirmationMessage = nil
                }
            } message: {
                Text(prepareConfirmationMessage ?? "Missing ingredients. Continue anyway?")
            }
            .sheet(item: $pendingEatEntry) { entry in
                ManifestPlateUpSheet(
                    entry: entry,
                    hasIntakeConsent: model.manifest?.intakeConsentGranted ?? false,
                    onSave: { servings, notes in
                        await handleLogServing(entry, servings: servings, notes: notes)
                    },
                    onRemove: entry.personalIntake != nil
                        ? { await handleClearServing(entry) }
                        : nil
                )
            }
    }

    private var manifestNavigationStack: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.manifest == nil {
                    LoadingView()
                } else if let manifest = model.manifest, let organizationId {
                    content(manifest, organizationId: organizationId)
                } else if let errorMessage = model.errorMessage {
                    loadFailure(message: errorMessage)
                } else {
                    emptyPrompt
                }
            }
            .navigationTitle("Manifest")
            .toolbar {
                if model.manifest != nil, showTodayToolbarButton {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Today") {
                            jumpToToday()
                        }
                        .disabled(model.isWeekNavigationBusy)
                        .accessibilityLabel("Jump to today")
                    }
                }
                GlobalPageToolbar(
                    syncDomain: SnapshotDomain.manifest,
                    organizationId: organizationId,
                    syncUserId: userId,
                    isRefreshing: model.isRefreshing,
                    onOptions: { showingOptions = true },
                    onOpenGroupSettings: onOpenGroupSettings,
                    onOpenSettings: onOpenSettings
                )
            }
            .dataSyncBanner(
                domain: SnapshotDomain.manifest,
                organizationId: organizationId,
                syncUserId: userId,
                isRefreshing: model.isRefreshing
            )
            .sheet(isPresented: $showingOptions) {
                ManifestOptionsSheet(
                    weekStart: model.weekStartPref,
                    calendarSpan: model.calendarSpan,
                    shareURL: model.share.shareURL,
                    shareExpiresAt: model.share.shareExpiresAt,
                    isLoadingShare: model.share.isLoading,
                    onShare: { await createManifestShare() },
                    onRevokeShare: { await revokeManifestShare() },
                    onUpgradeRequired: {
                        paywallContext = PaywallContext(trigger: .featureGate, resource: "share_manifest")
                    },
                    onSaveSettings: { weekStart, span in
                        do {
                            _ = try await env.api.patchSettings(SettingsPatch(
                                manifestSettings: ManifestSettings(
                                    weekStart: weekStart,
                                    calendarSpan: span
                                )
                            ))
                            model.configureFromSettings(calendarSpan: span, weekStartPref: weekStart)
                            Haptics.success()
                            await reload()
                        } catch {
                            model.errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                        }
                    }
                )
                .task { model.share.loadStatus { try await env.api.manifestShareStatus() } }
                .onDisappear { model.share.cancel() }
            }
            .sheet(item: $paywallContext) { ctx in
                PaywallView(context: ctx)
            }
            .background(Theme.ceramic)
            .sheet(isPresented: $showingAddEntry) {
                AddManifestEntrySheet(
                    defaultDate: model.selectedDay,
                    preselectedMealId: addEntryPrefillMealId
                ) { mealId, date, slot in
                    guard let organizationId = env.session.activeOrganizationId else {
                        return "Organization not ready."
                    }
                    guard let userId = env.session.session?.user.id else {
                        return "Session not ready."
                    }
                    let ok = await model.addEntry(
                        mealId: mealId,
                        date: date,
                        slotType: slot,
                        api: env.api,
                        snapshots: env.snapshots,
                        online: env.network.isOnline,
                        organizationId: organizationId,
                        userId: userId,
                        nutrition: env.nutrition
                    )
                    return ok ? nil : model.errorMessage
                }
                .onDisappear { addEntryPrefillMealId = nil }
            }
            .sheet(isPresented: $showingPlanWeek) {
                PlanWeekSheet { count in
                    onPlanWeekComplete(count)
                    await reload()
                }
            }
            .sheet(isPresented: $showingJumpCalendar) {
                ManifestJumpCalendarSheet(
                    initialDay: model.selectedDay,
                    weekStartPref: model.weekStartPref,
                    showConsumedMarkers: env.session.clientFlags.isNutritionManifestEnabled,
                    loadMarkers: { from, to in
                        let response = try await env.api.manifestPlannedDates(from: from, to: to)
                        return (response.dates, response.consumedDates ?? [])
                    },
                    onSelect: { isoDay in
                        jumpToCalendarDay(isoDay)
                    }
                )
            }
        }
    }

    private func jumpToCalendarDay(_ isoDay: String) {
        guard let organizationId, let userId else { return }
        let start = ManifestDateHelpers.normalizedNavigationStart(
            isoDay,
            calendarSpan: model.calendarSpan,
            weekStartPref: model.weekStartPref
        )
        model.selectedDay = isoDay
        model.requestNavigateWeek(
            to: start,
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId,
            userId: userId,
            nutrition: env.nutrition
        )
    }

    private func reload(organizationId: String? = nil) async {
        guard let organizationId = organizationId ?? self.organizationId,
              let userId
        else { return }
        env.configureNutritionScope()
        model.refreshOutcomes = env.refreshOutcomes
        await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.manifest) {
            await model.load(
                api: env.api,
                snapshots: env.snapshots,
                online: env.network.isOnline,
                organizationId: organizationId,
                userId: userId,
                nutrition: env.nutrition
            )
        }
    }

    private func loadFailure(message: String) -> some View {
        CopilotTrackableScrollSurface(tab: .manifest, isActive: isTabActive, hasTabAction: true) {
            VStack(spacing: 16) {
                EmptyStateView(
                    icon: "exclamationmark.triangle",
                    title: "Couldn't load Manifest",
                    message: message
                )
                Button("Try again") {
                    Task { await reload() }
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(!env.network.isOnline)
            }
            .padding(24)
        }
    }

    private var emptyPrompt: some View {
        CopilotTrackableScrollSurface(tab: .manifest, isActive: isTabActive, hasTabAction: true) {
            VStack(spacing: 16) {
                EmptyStateView(
                    icon: "calendar",
                    title: "Plan your next meal",
                    message: "Schedule meals from Galley to close your weekly loop."
                )
                Button("Add to plan") { showingAddEntry = true }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(!env.network.isOnline)
            }
            .padding(24)
        }
    }

    private var entryActionFlags: ManifestEntryActionPolicy.Flags {
        ManifestEntryActionPolicy.Flags(
            isCookLogSplitEnabled: env.session.clientFlags.isNutritionCookLogSplitEnabled,
            isNutritionManifestEnabled: env.session.clientFlags.isNutritionManifestEnabled
        )
    }

    private var nutritionByDate: [String: NutritionDayTotals] {
        guard let days = model.nutritionSummary?.days else { return [:] }
        return Dictionary(days.map { ($0.date, $0) }, uniquingKeysWith: { first, _ in first })
    }

    @ViewBuilder
    private func content(_ manifest: ManifestResponse, organizationId: String) -> some View {
        let entryDates = Set(manifest.entries.map(\.date))
        let dayEntries = manifest.entries.filter { $0.date == model.selectedDay }

        List {
            if !model.isLoading {
                ListCountHeader(count: manifestEntryCount)
            }
            WeekNavigator(
                calendarSpan: model.calendarSpan,
                rangeStart: model.rangeStart,
                selectedDay: $model.selectedDay,
                weekStartPref: model.weekStartPref,
                entryDates: entryDates,
                isLoading: model.isWeekNavigationBusy,
                nutritionByDate: nutritionByDate,
                nutritionGoal: model.nutritionSummary?.goal,
                showNutritionGoals: env.session.clientFlags.isNutritionGoalsEnabled,
                onTapNutrientLine: env.session.clientFlags.isNutritionGoalsEnabled ? onOpenNutritionGoals : nil,
                onOpenCalendar: env.session.clientFlags.isNutritionManifestEnabled
                    ? { showingJumpCalendar = true }
                    : nil
            ) { start in
                guard let userId else { return }
                model.requestNavigateWeek(
                    to: start,
                    api: env.api,
                    snapshots: env.snapshots,
                    online: env.network.isOnline,
                    organizationId: organizationId,
                    userId: userId,
                    nutrition: env.nutrition
                )
            }
            .listRowBackground(Color.clear)

            if let offlineBanner = model.offlineBannerMessage {
                Text(offlineBanner)
                    .rationCaption()
                    .foregroundStyle(Theme.warning)
                    .listRowBackground(Color.clear)
            }

            if let errorMessage = model.errorMessage ?? model.share.errorMessage {
                ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
            }

            if dayEntries.isEmpty {
                Text(model.offlineBannerMessage != nil
                    ? "Offline — showing cached plan. Meals for this day may be incomplete."
                    : "No meals planned for this day. Tap + to schedule one.")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
                    .listRowBackground(Color.clear)
            } else {
                Section {
                    HStack {
                        Text(ManifestDateHelpers.smartLabel(isoDate: model.selectedDay))
                            .rationHeadline()
                        Spacer()
                        ManifestDaySupplyToggle(
                            includedInSupply: model.isDayIncludedInSupply(model.selectedDay),
                            disabled: !env.network.isOnline || model.isTogglingSupplyDay
                        ) {
                            Task {
                                await model.toggleSupplyDay(
                                    model.selectedDay,
                                    api: env.api,
                                    online: env.network.isOnline
                                )
                            }
                        }
                    }
                } header: {
                    EmptyView()
                }
                .listRowBackground(Theme.surface)

                Section {
                    ForEach(dayEntries) { entry in
                        ManifestEntryRow(
                            entry: entry,
                            flags: entryActionFlags,
                            onConsume: {
                                Task { await handlePrepare(entry) }
                            },
                            onCook: {
                                Task { await handlePrepare(entry) }
                            },
                            onLogServing: {
                                pendingEatEntry = entry
                            },
                            onEditServing: {
                                pendingEatEntry = entry
                            }
                        )
                        .listRowBackground(Theme.surface)
                        .destructiveTrailingSwipe {
                            Task {
                                guard let userId else { return }
                                await model.deleteEntry(
                                    entry,
                                    api: env.api,
                                    snapshots: env.snapshots,
                                    online: env.network.isOnline,
                                    organizationId: organizationId,
                                    userId: userId
                                )
                            }
                        }
                    }
                }

                if entryActionFlags.isCookLogSplitEnabled,
                   entryActionFlags.isNutritionManifestEnabled
                {
                    let intakeRows = dayEntries.compactMap { entry -> (id: String, name: String, intake: ManifestPersonalIntake)? in
                        guard let intake = entry.personalIntake else { return nil }
                        return (entry.id, entry.mealName, intake)
                    }
                    if !intakeRows.isEmpty {
                        Section {
                            ForEach(intakeRows, id: \.id) { row in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(row.name)
                                        .rationBody()
                                        .foregroundStyle(Theme.carbon)
                                    Text(
                                        String(
                                            format: "%.1f serving%@ · %.0f kcal · P %.0fg · C %.0fg · F %.0fg",
                                            row.intake.servings,
                                            row.intake.servings == 1 ? "" : "s",
                                            row.intake.energyKcal,
                                            row.intake.proteinG,
                                            row.intake.carbsG,
                                            row.intake.fatG
                                        )
                                    )
                                    .rationCaption()
                                    .foregroundStyle(Theme.muted)
                                }
                                .listRowBackground(Theme.surface)
                            }
                        } header: {
                            Text("Intake log")
                                .rationCaption()
                                .textCase(.uppercase)
                                .foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .copilotDockScrollMargins()
        .copilotScrollTracked(tab: .manifest, isActive: isTabActive)
    }

    /// Deducts Cargo — routes to split Cook or legacy Consume based on `nutrition-cook-log-split`.
    private func handlePrepare(_ entry: ManifestEntry) async {
        guard let organizationId, let userId else { return }
        if entryActionFlags.isCookLogSplitEnabled {
            switch await model.cook(
                entry,
                api: env.api,
                snapshots: env.snapshots,
                online: env.network.isOnline,
                organizationId: organizationId,
                userId: userId
            ) {
            case .success(let token):
                setUndo(token: token, message: "Meal cooked")
                offerEatAfterCook(entry)
            case .needsConfirmation(let missing):
                pendingPrepareEntry = entry
                prepareConfirmationMessage = missingIngredientsMessage(missing)
                showPrepareConfirmation = true
            case .failed:
                break
            }
        } else {
            switch await model.consume(
                entry,
                api: env.api,
                snapshots: env.snapshots,
                online: env.network.isOnline,
                organizationId: organizationId,
                userId: userId
            ) {
            case .success(let token):
                setUndo(token: token, message: "Meal consumed")
            case .needsConfirmation(let missing):
                pendingPrepareEntry = entry
                prepareConfirmationMessage = missingIngredientsMessage(missing)
                showPrepareConfirmation = true
            case .failed:
                break
            }
        }
    }

    private func confirmPrepareDespiteShortfall() async {
        guard let entry = pendingPrepareEntry, let organizationId, let userId else { return }
        pendingPrepareEntry = nil
        prepareConfirmationMessage = nil
        showPrepareConfirmation = false
        if entryActionFlags.isCookLogSplitEnabled {
            if case .success(let token) = await model.cook(
                entry,
                confirmInsufficient: true,
                api: env.api,
                snapshots: env.snapshots,
                online: env.network.isOnline,
                organizationId: organizationId,
                userId: userId
            ) {
                setUndo(token: token, message: "Meal cooked")
                offerEatAfterCook(entry)
            }
        } else if case .success(let token) = await model.consume(
            entry,
            confirmInsufficient: true,
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId,
            userId: userId
        ) {
            setUndo(token: token, message: "Meal consumed")
        }
    }

    /// Mirror web: after a successful Cook, offer optional personal Eat plate-up.
    private func offerEatAfterCook(_ entry: ManifestEntry) {
        guard ManifestEntryActionPolicy.canEverLogServing(flags: entryActionFlags) else {
            return
        }
        // Prefer the refreshed entry (now prepared) when available.
        let refreshed = model.manifest?.entries.first(where: { $0.id == entry.id }) ?? entry
        pendingEatEntry = refreshed
    }

    /// Eat — private serving log. Returns an error message on failure for the sheet to display.
    private func handleLogServing(
        _ entry: ManifestEntry,
        servings: Double,
        notes: String? = nil
    ) async -> String? {
        switch await model.logServing(
            entry,
            servings: servings,
            notes: notes,
            idempotencyKey: UUID().uuidString,
            api: env.api,
            nutrition: env.nutrition
        ) {
        case .success(_, let token):
            setUndo(token: token, message: "Serving logged")
            return nil
        case .consentRequired:
            return "Allow personal serving logs to continue."
        case .nutritionUnavailable:
            return model.errorMessage ?? "Nutrition unavailable for this meal."
        case .nutritionUpdating:
            return model.errorMessage ?? "Nutrition totals are still updating. Try again shortly."
        case .failed:
            return model.errorMessage ?? "Couldn't log this serving."
        }
    }

    private func handleClearServing(_ entry: ManifestEntry) async {
        if let token = await model.clearServing(entry, api: env.api, nutrition: env.nutrition) {
            setUndo(token: token, message: "Serving removed")
        }
    }

    private func setUndo(token: String?, message: String) {
        guard let token else { return }
        pendingUndo = ManifestUndoToast(token: token, message: message)
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
        return "Missing \(missing.count) ingredient\(missing.count == 1 ? "" : "s").\n\(lines.joined(separator: "\n"))\n\nContinue anyway and deduct what's available?"
    }

    private func createManifestShare() async {
        if let ctx = await model.share.create(
            { try await env.api.createManifestShare() },
            onForbidden: { ShareLinkController.paywallContext(from: $0, defaultResource: "share_manifest") }
        ) {
            paywallContext = ctx
        }
    }

    private func revokeManifestShare() async {
        await model.share.revoke { try await env.api.revokeManifestShare() }
    }

    private func performUndo(_ token: String) async {
        guard env.network.isOnline, let organizationId, let userId else {
            pendingUndo = nil
            return
        }
        pendingUndo = nil
        do {
            _ = try await env.api.undoAction(token: token)
            Haptics.light()
            model.refreshOutcomes = env.refreshOutcomes
            await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.manifest) {
                await model.load(
                    api: env.api,
                    snapshots: env.snapshots,
                    online: env.network.isOnline,
                    organizationId: organizationId,
                    userId: userId,
                    nutrition: env.nutrition
                )
            }
        } catch {
            if SnapshotRefreshPolicy.isIgnorableRefreshError(error) { return }
            model.errorMessage = SnapshotRefreshPolicy.userFacingRefreshDetail(error)
        }
    }
}

/// Shared undo-toast payload for Consume, Cook, and Eat mutations.
struct ManifestUndoToast: Equatable {
    let token: String
    let message: String
}

struct ManifestDaySupplyToggle: View {
    let includedInSupply: Bool
    var disabled = false
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            Text(includedInSupply ? "On Supply" : "Off Supply")
                .font(Typography.caption())
                .textCase(.uppercase)
                .foregroundStyle(includedInSupply ? Theme.hyperGreen : Theme.muted)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(includedInSupply ? Theme.hyperGreen.opacity(0.15) : Theme.platinum)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityLabel(
            includedInSupply
                ? "Included in shopping list. Tap to exclude this day."
                : "Excluded from shopping list. Tap to include this day."
        )
    }
}
