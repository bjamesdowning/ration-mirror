import SwiftUI
import Observation

@MainActor
@Observable
final class ManifestViewModel {
    private(set) var manifest: ManifestResponse?
    private(set) var isLoading = false
    private(set) var isSavingEntry = false
    var errorMessage: String?
    var offlineBannerMessage: String?
    var rangeStart: String = ManifestDateHelpers.todayISO()
    var selectedDay: String = ManifestDateHelpers.todayISO()
    var calendarSpan = 7
    var weekStartPref = "sunday"
    private(set) var hasInitializedAnchor = false

    func applyInitialAnchorIfNeeded() {
        guard !hasInitializedAnchor else { return }
        rangeStart = ManifestDateHelpers.initialRangeStart(
            calendarSpan: calendarSpan,
            weekStartPref: weekStartPref
        )
        selectedDay = ManifestDateHelpers.todayISO()
        hasInitializedAnchor = true
    }

    func configureFromSettings(calendarSpan: Int, weekStartPref: String) {
        self.calendarSpan = calendarSpan
        self.weekStartPref = weekStartPref
        if !hasInitializedAnchor {
            applyInitialAnchorIfNeeded()
        }
    }

    func resetAnchorForOrganizationChange() {
        hasInitializedAnchor = false
        applyInitialAnchorIfNeeded()
    }

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        isLoading = true
        errorMessage = nil
        offlineBannerMessage = nil
        defer { isLoading = false }

        let endDate = ManifestDateHelpers.addDays(rangeStart, days: max(calendarSpan - 1, 0))

        if online {
            do {
                let data = try await api.manifest(startDate: rangeStart, endDate: endDate)
                manifest = data
                snapshots.save(data, domain: SnapshotDomain.manifest, organizationId: organizationId)
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                restoreSnapshot(
                    snapshots,
                    organizationId: organizationId,
                    requestedStart: rangeStart,
                    preserveRangeStart: true
                )
            }
        } else {
            restoreSnapshot(
                snapshots,
                organizationId: organizationId,
                requestedStart: rangeStart,
                preserveRangeStart: false
            )
        }
    }

    func navigateWeek(to start: String, api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        let normalizedStart = ManifestDateHelpers.normalizedNavigationStart(
            start,
            calendarSpan: calendarSpan,
            weekStartPref: weekStartPref
        )
        let newSelectedDay = resolvedSelectedDay(forWeekStart: normalizedStart, previousSelected: selectedDay)
        let endDate = ManifestDateHelpers.addDays(normalizedStart, days: max(calendarSpan - 1, 0))

        isLoading = true
        errorMessage = nil
        offlineBannerMessage = nil
        defer { isLoading = false }

        if online {
            do {
                let data = try await api.manifest(startDate: normalizedStart, endDate: endDate)
                rangeStart = normalizedStart
                selectedDay = newSelectedDay
                manifest = data
                snapshots.save(data, domain: SnapshotDomain.manifest, organizationId: organizationId)
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        } else if let cached = snapshots.load(ManifestResponse.self, domain: SnapshotDomain.manifest, organizationId: organizationId) {
            if cached.payload.startDate == normalizedStart {
                rangeStart = normalizedStart
                selectedDay = newSelectedDay
                manifest = cached.payload
            } else {
                let formatted = ManifestDateHelpers.formatRange(
                    start: cached.payload.startDate,
                    end: cached.payload.endDate
                )
                offlineBannerMessage = "Offline — showing cached week \(formatted)"
                rangeStart = cached.payload.startDate
                selectedDay = resolvedSelectedDay(
                    forWeekStart: cached.payload.startDate,
                    previousSelected: selectedDay
                )
                manifest = cached.payload
            }
        } else {
            offlineBannerMessage = "Offline — no cached manifest data for this week"
        }
    }

    private func resolvedSelectedDay(forWeekStart start: String, previousSelected: String) -> String {
        let visible = ManifestDateHelpers.calendarDates(
            span: calendarSpan,
            anchor: start,
            weekStartPref: weekStartPref
        )
        if visible.contains(previousSelected) {
            return previousSelected
        }
        if visible.contains(ManifestDateHelpers.todayISO()) {
            return ManifestDateHelpers.todayISO()
        }
        return visible.first ?? start
    }

    func consume(_ entry: ManifestEntry, api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async -> String? {
        do {
            let result = try await api.consumeManifestEntries([entry.id])
            Haptics.success()
            markEntryConsumedLocally(entryId: entry.id)
            let undoToken = result.undoToken
            await reloadManifestSilently(
                api: api,
                snapshots: snapshots,
                online: online,
                organizationId: organizationId
            )
            return undoToken
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }

    private func markEntryConsumedLocally(entryId: String) {
        guard let manifest else { return }
        let now = Date()
        let updated = manifest.entries.map { entry -> ManifestEntry in
            guard entry.id == entryId else { return entry }
            return ManifestEntry(
                id: entry.id,
                planId: entry.planId,
                mealId: entry.mealId,
                date: entry.date,
                slotType: entry.slotType,
                orderIndex: entry.orderIndex,
                servingsOverride: entry.servingsOverride,
                notes: entry.notes,
                consumedAt: now,
                createdAt: entry.createdAt,
                mealName: entry.mealName,
                mealServings: entry.mealServings,
                mealType: entry.mealType,
                mealPrepTime: entry.mealPrepTime,
                mealCookTime: entry.mealCookTime
            )
        }
        self.manifest = ManifestResponse(
            plan: manifest.plan,
            startDate: manifest.startDate,
            endDate: manifest.endDate,
            entries: updated
        )
    }

    private func reloadManifestSilently(
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async {
        let endDate = ManifestDateHelpers.addDays(rangeStart, days: max(calendarSpan - 1, 0))
        guard online else { return }
        do {
            let data = try await api.manifest(startDate: rangeStart, endDate: endDate)
            manifest = data
            snapshots.save(data, domain: SnapshotDomain.manifest, organizationId: organizationId)
        } catch {
            // Consume succeeded — do not surface reload failures as errors.
        }
    }

    func addEntry(
        mealId: String,
        date: String,
        slotType: String,
        api: RationAPI,
        snapshots: SnapshotStore,
        online: Bool,
        organizationId: String
    ) async -> Bool {
        guard online else {
            errorMessage = "Planning meals requires a network connection."
            return false
        }
        isSavingEntry = true
        errorMessage = nil
        defer { isSavingEntry = false }
        do {
            _ = try await api.addManifestEntry(
                ManifestEntryCreate(mealId: mealId, date: date, slotType: slotType)
            )
            Haptics.success()
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
            return true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }

    private func restoreSnapshot(
        _ snapshots: SnapshotStore,
        organizationId: String,
        requestedStart: String,
        preserveRangeStart: Bool = false
    ) {
        guard let cached = snapshots.load(ManifestResponse.self, domain: SnapshotDomain.manifest, organizationId: organizationId) else {
            return
        }
        manifest = cached.payload
        if !requestedStart.isEmpty, cached.payload.startDate != requestedStart {
            let formatted = ManifestDateHelpers.formatRange(
                start: cached.payload.startDate,
                end: cached.payload.endDate
            )
            offlineBannerMessage = "Offline — showing cached week \(formatted)"
        }
        if !preserveRangeStart {
            rangeStart = cached.payload.startDate
            selectedDay = resolvedSelectedDay(forWeekStart: cached.payload.startDate, previousSelected: selectedDay)
        }
    }
}

struct ManifestView: View {
    @Environment(AppEnvironment.self) private var env
    var onOpenSettings: () -> Void = {}
    var onPlanWeekComplete: (Int) -> Void = { _ in }
    @State private var model = ManifestViewModel()
    @State private var showingAddEntry = false
    @State private var showingPlanWeek = false
    @State private var showingOptions = false
    @State private var manifestShareURL: String?
    @State private var manifestShareExpiresAt: String?
    @State private var isLoadingShare = false
    @State private var showingPaywall = false
    @State private var consumeUndoToken: String?
    @State private var showConsumeUndo = false

    private var organizationId: String {
        env.session.activeOrganizationId ?? "unknown"
    }

    private var manifestEntryCount: Int {
        guard let manifest = model.manifest else { return 0 }
        let end = ManifestDateHelpers.addDays(model.rangeStart, days: max(model.calendarSpan - 1, 0))
        return manifest.entries.filter { $0.date >= model.rangeStart && $0.date <= end }.count
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.manifest == nil {
                    LoadingView()
                } else if let manifest = model.manifest {
                    content(manifest)
                } else {
                    emptyPrompt
                }
            }
            .navigationTitle("Manifest")
            .toolbar {
                GlobalPageToolbar(
                    syncDomain: SnapshotDomain.manifest,
                    organizationId: organizationId,
                    countChip: manifestEntryCount > 0 ? manifestEntryCount : nil,
                    onOptions: { showingOptions = true },
                    onOpenSettings: onOpenSettings
                )
            }
            .sheet(isPresented: $showingOptions) {
                ManifestOptionsSheet(
                    shareURL: manifestShareURL,
                    shareExpiresAt: manifestShareExpiresAt,
                    isLoadingShare: isLoadingShare,
                    onShare: { await createManifestShare() },
                    onRevokeShare: { await revokeManifestShare() },
                    onUpgradeRequired: { showingPaywall = true }
                )
                .task { await loadManifestShareStatus() }
            }
            .sheet(isPresented: $showingPaywall) { PaywallView() }
            .background(Theme.ceramic)
            .sheet(isPresented: $showingAddEntry) {
                AddManifestEntrySheet(defaultDate: model.manifest?.startDate) { mealId, date, slot in
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
            .safeAreaInset(edge: .bottom) {
                IconFAB(
                    systemImage: "plus.circle.fill",
                    accessibilityLabel: "Manifest actions",
                    disabled: !env.network.isOnline
                ) {
                    Button { showingAddEntry = true } label: {
                        Label("Add entry", systemImage: "plus")
                    }
                    .disabled(!env.network.isOnline)
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
                .padding(.bottom, 24)
            }
        }
        .task(id: organizationId) {
            model.resetAnchorForOrganizationChange()
            if let settings = try? await env.api.settings().settings.manifestSettings {
                model.configureFromSettings(
                    calendarSpan: settings.calendarSpan ?? 7,
                    weekStartPref: settings.weekStart ?? "sunday"
                )
            } else {
                model.applyInitialAnchorIfNeeded()
            }
            await reload()
            await loadManifestShareStatus()
        }
        .refreshable { await reload() }
    }

    private func reload() async {
        await model.load(
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId
        )
    }

    private var emptyPrompt: some View {
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

    @ViewBuilder
    private func content(_ manifest: ManifestResponse) -> some View {
        let entryDates = Set(manifest.entries.map(\.date))
        let dayEntries = manifest.entries.filter { $0.date == model.selectedDay }

        List {
            WeekNavigator(
                calendarSpan: model.calendarSpan,
                rangeStart: $model.rangeStart,
                selectedDay: $model.selectedDay,
                weekStartPref: model.weekStartPref,
                entryDates: entryDates,
                isLoading: model.isLoading,
            ) { start in
                Task {
                    await model.navigateWeek(
                        to: start,
                        api: env.api,
                        snapshots: env.snapshots,
                        online: env.network.isOnline,
                        organizationId: organizationId
                    )
                }
            }
            .listRowBackground(Color.clear)

            if let offlineBanner = model.offlineBannerMessage {
                Text(offlineBanner)
                    .rationCaption()
                    .foregroundStyle(Theme.warning)
                    .listRowBackground(Color.clear)
            }

            if let errorMessage = model.errorMessage {
                ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
            }

            if dayEntries.isEmpty {
                Text("No meals planned for this day. Tap + to schedule one.")
                    .rationCaption()
                    .listRowBackground(Color.clear)
            } else {
                Section(model.selectedDay) {
                    ForEach(dayEntries) { entry in
                        ManifestEntryRow(
                            entry: entry,
                            onConsume: {
                                Task {
                                    if let token = await model.consume(
                                        entry,
                                        api: env.api,
                                        snapshots: env.snapshots,
                                        online: env.network.isOnline,
                                        organizationId: organizationId
                                    ) {
                                        consumeUndoToken = token
                                        showConsumeUndo = true
                                    }
                                }
                            }
                        )
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }

    private func loadManifestShareStatus() async {
        isLoadingShare = true
        defer { isLoadingShare = false }
        do {
            let status = try await env.api.manifestShareStatus()
            manifestShareURL = status.shareUrl
            manifestShareExpiresAt = status.shareExpiresAt
        } catch {}
    }

    private func createManifestShare() async {
        do {
            let response = try await env.api.createManifestShare()
            manifestShareURL = response.shareUrl
            manifestShareExpiresAt = response.shareExpiresAt
            Haptics.success()
        } catch let error as APIError {
            if case .server(let status, _, _, _, _) = error, status == 403 {
                showingPaywall = true
            }
        } catch {}
    }

    private func revokeManifestShare() async {
        _ = try? await env.api.revokeManifestShare()
        manifestShareURL = nil
        manifestShareExpiresAt = nil
        Haptics.light()
    }

    private func undoConsume() async {
        guard let token = consumeUndoToken, env.network.isOnline else {
            showConsumeUndo = false
            consumeUndoToken = nil
            return
        }
        showConsumeUndo = false
        consumeUndoToken = nil
        do {
            _ = try await env.api.undoAction(token: token)
            Haptics.light()
            await model.load(
                api: env.api,
                snapshots: env.snapshots,
                online: env.network.isOnline,
                organizationId: organizationId
            )
        } catch {
            model.errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct ManifestEntryRow: View {
    let entry: ManifestEntry
    let onConsume: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            SlotGlyphView(slotType: entry.slotType)
            NavigationLink {
                MealDetailView(
                    mealId: entry.mealId,
                    initialMeal: entry.stubMeal()
                )
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.mealName.capitalized).rationBody()
                    Text(entry.mealType.capitalized)
                        .rationCaption()
                }
            }
            .buttonStyle(.plain)
            Spacer()
            if entry.isConsumed {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(Theme.hyperGreen)
                    .accessibilityLabel("Consumed")
            } else {
                Button(action: onConsume) {
                    Image(systemName: "fork.knife.circle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(Theme.hyperGreen)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Consume meal and deduct from Cargo")
            }
        }
        .padding(.vertical, 4)
    }
}

private extension ManifestEntry {
    func stubMeal() -> Meal {
        Meal(
            id: mealId,
            organizationId: "",
            name: mealName,
            domain: "food",
            type: mealType,
            description: nil,
            directions: nil,
            equipment: [],
            servings: mealServings,
            prepTime: mealPrepTime,
            cookTime: mealCookTime,
            createdAt: Date(),
            updatedAt: Date(),
            tags: [],
            ingredients: []
        )
    }
}
