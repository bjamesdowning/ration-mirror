import SwiftUI
import Observation

struct ManifestView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(CopilotScrollContext.self) private var scrollContext
    var isTabActive: Bool = false
    var onOpenSettings: () -> Void = {}
    var onOpenGroupSettings: () -> Void = {}
    var onPlanWeekComplete: (Int) -> Void = { _ in }
    @State private var model = ManifestViewModel()
    @State private var showingAddEntry = false
    @State private var showingPlanWeek = false
    @State private var showingOptions = false
    @State private var paywallContext: PaywallContext?
    @State private var consumeUndoToken: String?
    @State private var showConsumeUndo = false
    @State private var pendingConsumeEntry: ManifestEntry?
    @State private var consumeConfirmationMessage: String?
    @State private var showConsumeConfirmation = false

    private var organizationId: String? {
        env.session.activeOrganizationId
    }

    private var loadTaskKey: String {
        "\(organizationId ?? "nil")-\(isTabActive)-\(env.lifecycle.refreshToken(forTab: 3))"
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
        guard let organizationId else { return }
        model.requestNavigateWeek(
            to: todayNavigationAnchor,
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId
        )
    }

    var body: some View {
        manifestNavigationStack
            .tabDockAction(tag: 3) {
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
                if showConsumeUndo, consumeUndoToken != nil {
                    UndoToast(
                        message: "Meal consumed",
                        onUndo: { Task { await undoConsume() } },
                        onDismiss: {
                            showConsumeUndo = false
                            consumeUndoToken = nil
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
            .refreshable { await reload() }
            .alert("Insufficient cargo", isPresented: $showConsumeConfirmation) {
                Button("Consume anyway") {
                    Task { await confirmConsumeDespiteShortfall() }
                }
                Button("Cancel", role: .cancel) {
                    pendingConsumeEntry = nil
                    consumeConfirmationMessage = nil
                }
            } message: {
                Text(consumeConfirmationMessage ?? "Missing ingredients. Consume anyway?")
            }
    }

    private var manifestNavigationStack: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.manifest == nil {
                    LoadingView()
                } else if let manifest = model.manifest, let organizationId {
                    content(manifest, organizationId: organizationId)
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
                    isRefreshing: model.isRefreshing,
                    onOptions: { showingOptions = true },
                    onOpenGroupSettings: onOpenGroupSettings,
                    onOpenSettings: onOpenSettings
                )
            }
            .dataSyncBanner(
                domain: SnapshotDomain.manifest,
                organizationId: organizationId,
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
                AddManifestEntrySheet(defaultDate: model.manifest?.startDate) { mealId, date, slot in
                    guard let organizationId = env.session.activeOrganizationId else {
                        return "Organization not ready."
                    }
                    let ok = await model.addEntry(
                        mealId: mealId,
                        date: date,
                        slotType: slot,
                        api: env.api,
                        snapshots: env.snapshots,
                        online: env.network.isOnline,
                        organizationId: organizationId
                    )
                    return ok ? nil : model.errorMessage
                }
            }
            .sheet(isPresented: $showingPlanWeek) {
                PlanWeekSheet { count in
                    onPlanWeekComplete(count)
                    await reload()
                }
            }
        }
    }

    private func reload(organizationId: String? = nil) async {
        guard let organizationId = organizationId ?? self.organizationId else { return }
        model.refreshOutcomes = env.refreshOutcomes
        await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.manifest) {
            await model.load(
                api: env.api,
                snapshots: env.snapshots,
                online: env.network.isOnline,
                organizationId: organizationId
            )
        }
    }

    private var emptyPrompt: some View {
        CopilotTrackableScrollSurface(tab: 3, isActive: isTabActive, hasTabAction: true) {
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
            ) { start in
                model.requestNavigateWeek(
                    to: start,
                    api: env.api,
                    snapshots: env.snapshots,
                    online: env.network.isOnline,
                    organizationId: organizationId
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
                            onConsume: {
                                Task { await handleConsume(entry) }
                            }
                        )
                        .listRowBackground(Theme.surface)
                        .destructiveTrailingSwipe {
                            Task {
                                await model.deleteEntry(
                                    entry,
                                    api: env.api,
                                    snapshots: env.snapshots,
                                    online: env.network.isOnline,
                                    organizationId: organizationId
                                )
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .copilotDockScrollMargins()
        .copilotScrollTracked(tab: 3, isActive: isTabActive)
    }

    private func handleConsume(_ entry: ManifestEntry) async {
        guard let organizationId else { return }
        switch await model.consume(
            entry,
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId
        ) {
        case .success(let token):
            consumeUndoToken = token
            showConsumeUndo = true
        case .needsConfirmation(let missing):
            pendingConsumeEntry = entry
            consumeConfirmationMessage = missingIngredientsMessage(missing)
            showConsumeConfirmation = true
        case .failed:
            break
        }
    }

    private func confirmConsumeDespiteShortfall() async {
        guard let entry = pendingConsumeEntry, let organizationId else { return }
        pendingConsumeEntry = nil
        consumeConfirmationMessage = nil
        showConsumeConfirmation = false
        switch await model.consume(
            entry,
            confirmInsufficient: true,
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId
        ) {
        case .success(let token):
            consumeUndoToken = token
            showConsumeUndo = true
        case .needsConfirmation, .failed:
            break
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
        return "Missing \(missing.count) ingredient\(missing.count == 1 ? "" : "s").\n\(lines.joined(separator: "\n"))\n\nConsume anyway and deduct what's available?"
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

    private func undoConsume() async {
        guard let token = consumeUndoToken, env.network.isOnline, let organizationId else {
            showConsumeUndo = false
            consumeUndoToken = nil
            return
        }
        showConsumeUndo = false
        consumeUndoToken = nil
        do {
            _ = try await env.api.undoAction(token: token)
            Haptics.light()
            model.refreshOutcomes = env.refreshOutcomes
            await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.manifest) {
                await model.load(
                    api: env.api,
                    snapshots: env.snapshots,
                    online: env.network.isOnline,
                    organizationId: organizationId
                )
            }
        } catch {
            if SnapshotRefreshPolicy.isIgnorableRefreshError(error) { return }
            model.errorMessage = SnapshotRefreshPolicy.userFacingRefreshDetail(error)
        }
    }
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
