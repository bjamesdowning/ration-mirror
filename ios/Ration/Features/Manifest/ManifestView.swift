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
    @State private var addEntrySlot: String?
    @State private var addEntryPrefillMealId: String?
    @State private var showingPlanWeek = false
    @State private var showingOptions = false
    @State private var showingJumpCalendar = false
    @State private var showingMacros = false
    @State private var paywallContext: PaywallContext?
    @State private var pendingUndo: ManifestUndoToast?
    /// Cook deducts Cargo and may need the "insufficient stock, cook anyway?" confirmation.
    @State private var pendingPrepareEntry: ManifestEntry?
    @State private var prepareConfirmationMessage: String?
    @State private var showPrepareConfirmation = false
    @State private var pendingEatEntry: ManifestEntry?
    @State private var editingEntry: ManifestEntry?
    @State private var editingCargoLine: ManifestCargoLine?
    @State private var fuelCargoLine: ManifestCargoLine?
    @State private var fuelCargoNutrition: NutritionSnapshot?
    @State private var cargoFuelKey = UUID().uuidString
    @State private var cookingCargoLineIds: Set<String> = []
    @State private var showFuelLog = false
    @State private var fuelExisting: LogToFuelExisting?

    private var fuelCapture: Bool {
        HubCapturePolicy.choiceVisible(
            fastLogEnabled: env.session.clientFlags.isNutritionFastLogEnabled,
            appVersion: AppMarketingVersion.current
        )
    }

    private var planFuelNames: PlanFuelNames.Snapshot {
        PlanFuelNames.snapshot(planFuelActions: env.session.clientFlags.isPlanFuelActionsEnabled)
    }

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
                    if fuelCapture {
                        Button {
                            fuelExisting = nil
                            showFuelLog = true
                        } label: {
                            Label("Log to Fuel", systemImage: planFuelNames.logToFuelSymbol)
                        }
                        .disabled(!env.network.isOnline)
                    }
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
                model.selectedDay = pending.date
                addEntryPrefillMealId = pending.mealId
                showingAddEntry = true
                env.deepLinkRouter.acknowledgeManifestAddEntry()
            }
            .refreshable { await reload() }
            .onChange(of: env.manifestDataRevision) { _, _ in
                Task { await reload() }
            }
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
            .sheet(item: $editingEntry) { entry in
                ManifestLineEditSheet(entry: entry) { date, slot, servings in
                    try await env.api.updateManifestEntry(
                        id: entry.id,
                        date: date,
                        slotType: slot,
                        servingsOverride: servings
                    )
                    await reload()
                }
            }
            .sheet(item: $editingCargoLine) { line in
                CargoLineEditSheet(line: line) { date, slot, quantity in
                    _ = try await env.api.updateCargoLine(
                        id: line.id,
                        date: date,
                        slotType: slot,
                        quantity: quantity
                    )
                    await reload()
                }
            }
            .sheet(item: $fuelCargoLine) { line in
                PlanFuelAmountSheet(
                    title: FuelAmountEntry.title(
                        planFuelActionsEnabled: env.session.clientFlags.isPlanFuelActionsEnabled
                    ),
                    unit: line.unit,
                    start: line.quantity,
                    energy: { quantity in
                        CargoEatMacroEstimate.scaled(
                            nutrition: fuelCargoNutrition,
                            quantity: quantity,
                            unit: line.unit
                        ).energyKcal
                    }
                ) { submission in
                    try await logCookedCargo(line, submission: submission)
                }
            }
            .sheet(item: $pendingEatEntry) { entry in
                ManifestPlateUpSheet(
                    entry: entry,
                onSave: { servings, notes, amount, unit in
                    await handleLogServing(
                        entry,
                        servings: servings,
                        notes: notes,
                        amount: amount,
                        unit: unit
                    )
                },
                    onRemove: entry.personalIntake != nil
                        ? { await handleClearServing(entry) }
                        : nil
                )
            }
            .sheet(isPresented: $showFuelLog) {
                LogToFuelSheet(
                    existing: fuelExisting,
                    onClose: { showFuelLog = false },
                    onSaved: { Task { await reload() } }
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
            .rationLargeTitle()
            .ceramicPageChrome()
            .toolbar {
                GlobalPageToolbar(
                    syncDomain: SnapshotDomain.manifest,
                    organizationId: organizationId,
                    syncUserId: userId,
                    isRefreshing: model.isRefreshing,
                    onOptions: { showingOptions = true },
                    accessories: manifestAccessories,
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
                            let response = try await env.api.patchSettings(SettingsPatch(
                                manifestSettings: ManifestSettings(
                                    weekStart: weekStart,
                                    calendarSpan: span
                                )
                            ))
                            env.launch.updateUserSettings(response.settings)
                            let stored = response.settings.manifestSettings
                            model.configureFromSettings(
                                calendarSpan: stored?.calendarSpan ?? span,
                                weekStartPref: stored?.weekStart ?? weekStart
                            )
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
            .navigationDestination(isPresented: $showingMacros) {
                MacrosHistoryView(onOpenGoals: onOpenNutritionGoals)
            }
            .sheet(isPresented: $showingAddEntry) {
                AddManifestEntrySheet(
                    defaultDate: model.selectedDay,
                    preselectedMealId: addEntryPrefillMealId,
                    preselectedSlot: addEntrySlot
                ) { mealId, date, slot, servings in
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
                        servingsOverride: servings,
                        api: env.api,
                        snapshots: env.snapshots,
                        online: env.network.isOnline,
                        organizationId: organizationId,
                        userId: userId,
                        nutrition: env.nutrition
                    )
                    return ok ? nil : model.errorMessage
                }
                .onDisappear {
                    addEntryPrefillMealId = nil
                    addEntrySlot = nil
                }
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
        model.loadsNutritionSummary = !env.session.clientFlags.isNutritionFuelPageEnabled
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
                Button(planFuelNames.emptyState) { showingAddEntry = true }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(!env.network.isOnline)
            }
            .padding(24)
        }
    }

    private var nutritionByDate: [String: NutritionDayTotals] {
        guard let days = model.nutritionSummary?.days else { return [:] }
        return Dictionary(days.map { ($0.date, $0) }, uniquingKeysWith: { first, _ in first })
    }

    private var manifestAccessories: [PageCapsuleAccessory] {
        var items: [PageCapsuleAccessory] = []
        if !env.session.clientFlags.isNutritionFuelPageEnabled {
            items.append(
                PageCapsuleAccessory(
                    id: "macros",
                    systemImage: "chart.bar.fill",
                    label: "Macros",
                    action: { showingMacros = true }
                )
            )
        }
        if model.manifest != nil {
            let showingToday = model.rangeStart == todayNavigationAnchor
            items.append(
                PageCapsuleAccessory(
                    id: "today",
                    systemImage: "calendar",
                    label: "Today",
                    hint: showingToday ? nil : "Jump to today",
                    value: showingToday ? "Showing today" : nil,
                    isEnabled: !showingToday && !model.isWeekNavigationBusy,
                    action: { jumpToToday() }
                )
            )
        }
        return items
    }

    @ViewBuilder
    private func manifestDayCards(_ manifest: ManifestResponse, organizationId: String) -> some View {
        let dates = ManifestDateHelpers.calendarDates(
            span: model.calendarSpan,
            anchor: model.rangeStart,
            weekStartPref: model.weekStartPref
        )
        let order = ["breakfast", "lunch", "snack", "dinner"]
        ForEach(dates, id: \.self) { day in
            Section {
                HStack {
                    Text(ManifestDateHelpers.smartLabel(isoDate: day)).rationHeadline()
                    Spacer()
                    ManifestDaySupplyToggle(
                        includedInSupply: model.isDayIncludedInSupply(day),
                        disabled: !env.network.isOnline || model.isTogglingSupplyDay
                    ) {
                        Task {
                            await model.toggleSupplyDay(
                                day,
                                api: env.api,
                                online: env.network.isOnline
                            )
                        }
                    }
                }
            }
            .listRowBackground(Theme.surface)
            Section {
                ForEach(order, id: \.self) { slot in
                    let rows = manifest.entries.filter { entry in
                        entry.date == day && entry.slotType == slot
                    }
                    let lines = cargoLines(manifest, day: day, slot: slot)
                    if CargoManifestSlot.showsEmptyMealButton(
                        mealCount: rows.count,
                        cargoLineCount: lines.count
                    ) {
                        Button(slotTitle(slot)) {
                            model.selectedDay = day
                            addEntrySlot = slot
                            showingAddEntry = true
                        }
                        .frame(minHeight: 44)
                        .listRowBackground(Theme.surface)
                    } else if !rows.isEmpty {
                        ForEach(rows) { entry in
                            manifestEntry(entry, organizationId: organizationId)
                        }
                    }
                    ForEach(lines) { line in
                        cargoLineRow(line)
                    }
                }
                let other = manifest.entries.filter { entry in
                    entry.date == day && !order.contains(entry.slotType)
                }
                ForEach(other) { entry in
                    manifestEntry(entry, organizationId: organizationId)
                }
            }
        }
    }

    private func slotTitle(_ slot: String) -> String {
        switch slot {
        case "breakfast": return "Breakfast"
        case "lunch": return "Lunch"
        case "snack": return "Snack"
        default: return "Dinner"
        }
    }

    private func cargoLines(_ manifest: ManifestResponse, day: String, slot: String) -> [ManifestCargoLine] {
        guard env.session.clientFlags.isPlanFuelActionsEnabled else { return [] }
        return (manifest.cargoLines ?? []).filter { $0.date == day && $0.slotType == slot }
    }

    private func cargoLineRow(_ line: ManifestCargoLine) -> some View {
        HStack(spacing: 12) {
            Button {
                env.openDeepLink(.cargoItem(id: line.cargoId))
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(line.cargoName)
                        .rationBody()
                        .strikethrough(CargoManifestSlot.struckThrough(cookedAt: line.cookedAt))
                        .foregroundStyle(line.cookedAt == nil ? Theme.carbon : Theme.muted)
                    Text("\(FuelLogWrite.amountDisplay(line.quantity, unit: line.unit)) \(line.unit)")
                        .rationCaption()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(line.cargoName)
            Button {
                Task { await cookOrFuelCargo(line) }
            } label: {
                Image(systemName: line.cookedAt == nil ? "fork.knife.circle.fill" : "flame.fill")
                    .font(Typography.mono(28))
                    .foregroundStyle(Theme.hyperGreen)
                    .frame(
                        minWidth: CargoManifestSlot.controlPoints,
                        minHeight: CargoManifestSlot.controlPoints
                    )
            }
            .buttonStyle(.plain)
            .accessibilityLabel(line.cookedAt == nil ? "Cook" : "Fuel")
        }
        .frame(minHeight: CargoManifestSlot.controlPoints)
        .listRowBackground(Theme.surface)
        .modifier(ManifestLineSwipe(
            planFuelActions: env.session.clientFlags.isPlanFuelActionsEnabled,
            cooked: line.cookedAt != nil,
            onEdit: { editingCargoLine = line },
            onSoft: { Task { await cookOrFuelCargo(line) } },
            onDelete: { Task { await deleteCargoPlanLine(line) } }
        ))
    }

    private func cookOrFuelCargo(_ line: ManifestCargoLine) async {
        if line.cookedAt != nil {
            await openCargoFuel(line)
            return
        }
        var inFlight = cookingCargoLineIds
        guard inFlight.insert(line.id).inserted else { return }
        cookingCargoLineIds = inFlight
        defer {
            var remaining = cookingCargoLineIds
            remaining.remove(line.id)
            cookingCargoLineIds = remaining
        }
        do {
            let cooked = try await env.api.cookCargoLine(id: line.id)
            Haptics.success()
            model.errorMessage = nil
            env.notifyCargoDataChanged()
            setUndo(token: cooked.undoToken, message: "Cooked")
            await reload()
            await openCargoFuel(cooked.line)
        } catch {
            model.errorMessage = CargoManifestLineFailure.message(for: error)
        }
    }

    private func openCargoFuel(_ line: ManifestCargoLine) async {
        cargoFuelKey = UUID().uuidString
        do {
            fuelCargoNutrition = try await env.api.cargoItem(id: line.cargoId).item.nutrition
        } catch {
            fuelCargoNutrition = nil
        }
        fuelCargoLine = line
    }

    /// Logs the cooked line. Does not call addCargoToFuel, so Cargo is not deducted again.
    private func logCookedCargo(
        _ line: ManifestCargoLine,
        submission: FuelAmountSubmission
    ) async throws {
        let body = CargoManifestFuelLog.body(
            name: line.cargoName,
            quantity: submission.quantity,
            unit: line.unit,
            notes: submission.notes,
            nutrition: fuelCargoNutrition,
            editedEnergy: submission.energyKcal,
            operationKey: cargoFuelKey,
            occurredAt: ISO8601DateFormatter().string(from: Date())
        )
        let saved = try await env.api.logDiaryFood(body)
        setUndo(token: saved.undoToken ?? saved.operationId, message: "Serving logged")
        await reload()
    }

    /// Deletes the plan row only. Does not restore a cook and does not void a Fuel log.
    private func deleteCargoPlanLine(_ line: ManifestCargoLine) async {
        do {
            let result = try await env.api.deleteCargoLine(id: line.id)
            guard result.deleted else {
                model.errorMessage = "Plan line not found"
                return
            }
            model.errorMessage = nil
            await reload()
        } catch {
            model.errorMessage = CargoManifestLineFailure.message(for: error)
        }
    }

    private func manifestEntry(_ entry: ManifestEntry, organizationId: String) -> some View {
        ManifestEntryRow(
            entry: entry,
            onCook: { Task { await handlePrepare(entry) } },
            onLogServing: { pendingEatEntry = entry },
            onEditServing: { pendingEatEntry = entry }
        )
        .listRowBackground(Theme.surface)
        .modifier(ManifestLineSwipe(
            planFuelActions: env.session.clientFlags.isPlanFuelActionsEnabled,
            cooked: entry.isCooked,
            onEdit: { editingEntry = entry },
            onSoft: {
                if entry.isCooked {
                    pendingEatEntry = entry
                } else {
                    Task { await handlePrepare(entry) }
                }
            },
            onDelete: {
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
        ))
    }

    private func content(_ manifest: ManifestResponse, organizationId: String) -> some View {
        let dayEntries = manifest.entries.filter { $0.date == model.selectedDay }

        return List {
            if !model.isLoading {
                ListCountHeader(count: manifestEntryCount)
            }
            WeekNavigator(
                calendarSpan: model.calendarSpan,
                rangeStart: model.rangeStart,
                selectedDay: $model.selectedDay,
                weekStartPref: model.weekStartPref,
                isLoading: model.isWeekNavigationBusy,
                nutritionByDate: nutritionByDate,
                nutritionGoal: env.session.clientFlags.isNutritionFuelPageEnabled
                    ? nil
                    : model.nutritionSummary?.goal,
                onTapNutrientLine: env.session.clientFlags.isNutritionFuelPageEnabled
                    ? nil
                    : onOpenNutritionGoals,
                onOpenCalendar: { showingJumpCalendar = true }
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

            manifestDayCards(manifest, organizationId: organizationId)

            // Personal diary (incl. cross-kitchen rows) — independent of planned meals today.
            let intakeRows: [(id: String, name: String, organizationName: String?, intake: ManifestPersonalIntake, personalLog: Bool, loggedAmount: Double?, loggedUnit: String?, occurredAt: Date, slotType: String?)] = {
                let diary = (manifest.dayIntakeRows ?? []).filter { $0.manifestDate == model.selectedDay }
                if !diary.isEmpty {
                    return diary.map { row in
                        let when = FuelTime.date(from: row.occurredAt)
                        return (
                            row.id,
                            row.mealName ?? "Meal",
                            row.organizationName,
                            ManifestPersonalIntake(
                                id: row.id,
                                servings: row.servings,
                                energyKcal: row.energyKcal,
                                proteinG: row.proteinG,
                                carbsG: row.carbsG,
                                fatG: row.fatG,
                                occurredAt: when,
                                notes: row.notes
                            ),
                            row.personalLog == true,
                            row.loggedAmount,
                            row.loggedUnit,
                            when,
                            row.slotType
                        )
                    }
                }
                return dayEntries.compactMap { entry -> (id: String, name: String, organizationName: String?, intake: ManifestPersonalIntake, personalLog: Bool, loggedAmount: Double?, loggedUnit: String?, occurredAt: Date, slotType: String?)? in
                    guard let intake = entry.personalIntake else { return nil }
                    return (entry.id, entry.mealName, nil, intake, false, intake.loggedAmount, intake.loggedUnit?.rawValue, intake.occurredAt, entry.slotType)
                }
            }()
            let diaryGroups = DiaryLayout.present(
                rows: intakeRows,
                controlVisible: fuelCapture,
                layout: DiaryLayoutMode.normalize(env.launch.userSettings?.diaryLayout),
                id: { $0.id },
                slot: { $0.slotType },
                time: { $0.occurredAt }
            )
            if (!intakeRows.isEmpty || fuelCapture)
                && !env.session.clientFlags.isNutritionFuelPageEnabled {
                Section {
                    if fuelCapture {
                        Picker(
                            "Diary layout",
                            selection: Binding(
                                get: {
                                    DiaryLayoutMode.normalize(env.launch.userSettings?.diaryLayout)
                                },
                                set: { mode in
                                    Task { await setDiaryLayout(mode) }
                                }
                            )
                        ) {
                            Text("Timeline").tag(DiaryLayoutMode.timeline)
                            Text("Slots").tag(DiaryLayoutMode.slots)
                        }
                        .pickerStyle(.segmented)
                        .accessibilityLabel("Diary layout")
                    }
                    if intakeRows.isEmpty {
                        Button("Log to Fuel") {
                            fuelExisting = nil
                            showFuelLog = true
                        }
                    }
                    ForEach(diaryGroups) { group in
                        if let label = group.label {
                            Text(label)
                                .rationCaption()
                                .textCase(.uppercase)
                                .foregroundStyle(Theme.muted)
                                .accessibilityAddTraits(.isHeader)
                        }
                        ForEach(group.rows, id: \.id) { row in
                        let line = VStack(alignment: .leading, spacing: 4) {
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text(row.name)
                                    .rationBody()
                                    .foregroundStyle(Theme.carbon)
                                if let kitchen = row.organizationName, !kitchen.isEmpty {
                                    Text("· \(kitchen)")
                                        .rationCaption()
                                        .foregroundStyle(Theme.muted)
                                }
                            }
                            Text(
                                String(
                                    format: "%@%.1f serving%@ · %.0f kcal · P %.0fg · C %.0fg · F %.0fg",
                                    fuelCapture ? "\(FuelTime.clock(row.occurredAt)) · " : "",
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
                            if let note = row.intake.notes?.trimmingCharacters(in: .whitespacesAndNewlines),
                               !note.isEmpty {
                                Text(note)
                                    .rationCaption()
                                    .foregroundStyle(Theme.muted)
                                    .lineLimit(2)
                            }
                        }
                        if fuelCapture && row.personalLog {
                            Button {
                                fuelExisting = LogToFuelExisting(
                                    id: row.intake.id,
                                    name: row.name,
                                    amount: row.loggedAmount ?? row.intake.servings,
                                    unit: row.loggedUnit ?? "serving",
                                    energyKcal: row.intake.energyKcal,
                                    proteinG: row.intake.proteinG,
                                    carbsG: row.intake.carbsG,
                                    fatG: row.intake.fatG,
                                    occurredAt: row.occurredAt
                                )
                                showFuelLog = true
                            } label: {
                                line
                            }
                            .buttonStyle(.plain)
                        } else {
                            line
                        }
                    }
                    }
                } header: {
                    Text("Intake log")
                        .rationCaption()
                        .textCase(.uppercase)
                        .foregroundStyle(Theme.muted)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .copilotDockScrollMargins()
        .copilotScrollTracked(tab: .manifest, isActive: isTabActive)
    }

    private func setDiaryLayout(_ mode: DiaryLayoutMode) async {
        do {
            let response = try await env.api.patchSettings(SettingsPatch(diaryLayout: mode.rawValue))
            env.launch.updateUserSettings(response.settings)
        } catch {
            // The picker reads the stored value, so a failed write stays on the previous layout.
        }
    }

    /// Cook — deducts Cargo and marks the entry prepared.
    private func handlePrepare(_ entry: ManifestEntry) async {
        guard let organizationId, let userId else { return }
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
    }

    private func confirmPrepareDespiteShortfall() async {
        guard let entry = pendingPrepareEntry, let organizationId, let userId else { return }
        pendingPrepareEntry = nil
        prepareConfirmationMessage = nil
        showPrepareConfirmation = false
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
    }

    /// Mirror web: after a successful Cook, offer optional personal Eat plate-up.
    private func offerEatAfterCook(_ entry: ManifestEntry) {
        // Prefer the refreshed entry (now prepared) when available.
        let refreshed = model.manifest?.entries.first(where: { $0.id == entry.id }) ?? entry
        pendingEatEntry = refreshed
    }

    /// Eat — private serving log. Returns an error message on failure for the sheet to display.
    private func handleLogServing(
        _ entry: ManifestEntry,
        servings: Double,
        notes: String? = nil,
        amount: Double? = nil,
        unit: IntakeLoggedUnit? = nil
    ) async -> String? {
        switch await model.logServing(
            entry,
            servings: servings,
            notes: notes,
            amount: amount,
            unit: unit,
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

/// Shared undo-toast payload for Cook and Eat mutations.
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
