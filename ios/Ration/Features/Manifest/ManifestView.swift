import SwiftUI
import Observation

@MainActor
@Observable
final class ManifestViewModel {
    private(set) var manifest: ManifestResponse?
    private(set) var isLoading = false
    private(set) var isSavingEntry = false
    var errorMessage: String?
    var staleLabel: String?
    var rangeStart: String = ManifestDateHelpers.todayISO()
    var selectedDay: String = ManifestDateHelpers.todayISO()
    var calendarSpan = 7
    var weekStartPref = "sunday"

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let endDate = ManifestDateHelpers.addDays(rangeStart, days: max(calendarSpan - 1, 0))

        if online {
            do {
                let data = try await api.manifest(startDate: rangeStart, endDate: endDate)
                manifest = data
                snapshots.save(data, domain: SnapshotDomain.manifest, organizationId: organizationId)
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                restoreSnapshot(snapshots, organizationId: organizationId)
            }
        } else {
            restoreSnapshot(snapshots, organizationId: organizationId)
        }
        staleLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.manifest, organizationId: organizationId)
    }

    func navigateWeek(to start: String, api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        let previousSelected = selectedDay
        rangeStart = start
        let visible = ManifestDateHelpers.calendarDates(
            span: calendarSpan,
            anchor: rangeStart,
            weekStartPref: weekStartPref
        )
        if visible.contains(previousSelected) {
            selectedDay = previousSelected
        } else if visible.contains(ManifestDateHelpers.todayISO()) {
            selectedDay = ManifestDateHelpers.todayISO()
        } else {
            selectedDay = visible.first ?? start
        }
        await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
    }

    func consume(_ entry: ManifestEntry, api: RationAPI, snapshots: SnapshotStore, online: Bool, organizationId: String) async {
        do {
            _ = try await api.consumeManifestEntries([entry.id])
            Haptics.success()
            await load(api: api, snapshots: snapshots, online: online, organizationId: organizationId)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
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

    private func restoreSnapshot(_ snapshots: SnapshotStore, organizationId: String) {
        if let cached = snapshots.load(ManifestResponse.self, domain: SnapshotDomain.manifest, organizationId: organizationId) {
            manifest = cached.payload
        }
    }
}

struct ManifestView: View {
    @Environment(AppEnvironment.self) private var env
    var onOpenSettings: () -> Void = {}
    @State private var model = ManifestViewModel()
    @State private var showingAddEntry = false
    @State private var showingPlanWeek = false
    @State private var showingOptions = false
    @State private var manifestShareURL: String?
    @State private var manifestShareExpiresAt: String?
    @State private var isLoadingShare = false
    @State private var showingPaywall = false

    private var organizationId: String {
        env.session.activeOrganizationId ?? "unknown"
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
                PlanWeekSheet {
                    await reload()
                }
            }
            .safeAreaInset(edge: .bottom) {
                FloatingActionBar(actions: [
                    FloatingAction(
                        id: "add",
                        systemImage: "plus",
                        label: "Add",
                        action: { showingAddEntry = true },
                        disabled: !env.network.isOnline
                    ),
                    FloatingAction(
                        id: "plan",
                        systemImage: "sparkles",
                        label: "Plan week",
                        action: { showingPlanWeek = true },
                        isAI: true,
                        disabled: !env.network.isOnline
                    ),
                ])
            }
        }
        .task(id: organizationId) {
            if let settings = try? await env.api.settings().settings.manifestSettings {
                model.calendarSpan = settings.calendarSpan ?? 7
                model.weekStartPref = settings.weekStart ?? "sunday"
                model.rangeStart = ManifestDateHelpers.weekStart(
                    for: ManifestDateHelpers.todayISO(),
                    preference: model.weekStartPref
                )
                model.selectedDay = ManifestDateHelpers.todayISO()
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

            if let staleLabel = model.staleLabel {
                Text(staleLabel).rationCaption().listRowBackground(Color.clear)
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
                        ManifestEntryRow(entry: entry) {
                            Task {
                                await model.consume(
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
            if case .server(let status, _, _) = error, status == 403 {
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
}

struct ManifestEntryRow: View {
    let entry: ManifestEntry
    let onConsume: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.mealName.capitalized).rationBody()
                Text("\(entry.slotType.capitalized) · \(entry.mealType.capitalized)")
                    .rationCaption()
            }
            Spacer()
            if entry.isConsumed {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(Theme.hyperGreen)
            } else {
                Button("Consume", action: onConsume)
                    .font(Typography.caption())
                    .foregroundStyle(Theme.hyperGreen)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
