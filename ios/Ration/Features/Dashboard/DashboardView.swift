import SwiftUI
import Observation

struct DashboardView: View {
    @Environment(AppEnvironment.self) private var env
    var isTabActive: Bool = true
    /// Bumped when the Hub tab is re-tapped while already selected (exits edit mode).
    var hubTabReselectToken: Int = 0
    @Binding var isHubEditMode: Bool
    var onScan: () -> Void = {}
    var onOpenSettings: () -> Void = {}
    var onOpenGroupSettings: () -> Void = {}
    var onOpenSupply: () -> Void = {}
    var onOpenCargo: () -> Void = {}
    var onOpenGalley: () -> Void = {}
    var onOpenManifest: () -> Void = {}
    @State private var model = HubViewModel()
    @State private var selectedCargoRoute: HubCargoRoute?
    @State private var selectedMealRoute: HubMealRoute?

    private var organizationId: String? {
        env.session.activeOrganizationId
    }

    private var loadTaskKey: String {
        "\(organizationId ?? "nil")-\(isTabActive)-\(env.lifecycle.refreshToken(forTab: .hub))"
    }

    var body: some View {
        NavigationStack {
            Group {
                switch model.state {
                case .loading:
                    LoadingView()
                case let .failed(message):
                    VStack(spacing: 16) {
                        ErrorBanner(message: message)
                        Button("Retry") {
                            Task { await reload() }
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(24)
                case let .loaded(data):
                    if model.isEditMode {
                        HubEditView(
                            hubProfile: data.hubProfile,
                            hubLayout: data.hubLayout,
                            availableMealTags: data.availableMealTags,
                            availableCargoTags: data.availableCargoTags ?? [],
                            onSave: { widgets in
                                try await model.saveLayout(widgets, api: env.api)
                                await reload()
                            },
                            onSaveProfile: { profile in
                                try await model.saveProfile(profile, api: env.api)
                                await reload()
                            }
                        )
                    } else {
                        hubContent(data)
                    }
                }
            }
            .navigationTitle(model.isEditMode ? "Edit Hub" : "Hub")
            .toolbar {
                GlobalPageToolbar(
                    syncDomain: SnapshotDomain.hub,
                    organizationId: organizationId,
                    isRefreshing: model.isRefreshing,
                    onOpenGroupSettings: onOpenGroupSettings,
                    onOpenSettings: onOpenSettings
                )
                if case .loaded = model.state, model.isEditMode {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") {
                            model.isEditMode = false
                            Task { await reload() }
                        }
                    }
                } else if case .loaded = model.state, !model.isEditMode {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            model.isEditMode = true
                        } label: {
                            Image(systemName: "slider.horizontal.3")
                        }
                        .accessibilityLabel("Edit Hub layout")
                    }
                }
            }
            .background(Theme.ceramic)
            .safeAreaInset(edge: .top, spacing: 0) {
                if let message = model.refreshErrorMessage {
                    ErrorBanner(message: message)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                        .background(Theme.ceramic)
                }
            }
            .dataSyncBanner(
                domain: SnapshotDomain.hub,
                organizationId: organizationId,
                isRefreshing: model.isRefreshing
            )
            .navigationDestination(item: $selectedCargoRoute) { route in
                CargoDetailView(itemId: route.id)
            }
            .navigationDestination(item: $selectedMealRoute) { route in
                MealDetailView(mealId: route.meal.id, initialMeal: route.meal)
            }
        }
        .task(id: loadTaskKey) {
            guard isTabActive, let organizationId else { return }
            model.refreshOutcomes = env.refreshOutcomes
            await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.hub) {
                await model.load(
                    api: env.api,
                    snapshots: env.snapshots,
                    online: env.network.isOnline,
                    organizationId: organizationId
                )
            }
        }
        .onChange(of: env.cargoDataRevision) { _, _ in
            Task {
                try? await Task.sleep(nanoseconds: 400_000_000)
                guard let organizationId else { return }
                // Always drop stale hub snapshot so restore-first cannot flash
                // outdated meal readiness after cargo delete/cook.
                await env.snapshots.clear(domain: SnapshotDomain.hub, organizationId: organizationId)
                guard isTabActive else { return }
                await reload()
            }
        }
        .onChange(of: hubTabReselectToken) { _, _ in
            guard model.isEditMode else { return }
            model.isEditMode = false
            Task { await reload() }
        }
        .onChange(of: model.isEditMode) { _, editing in
            isHubEditMode = editing
        }
        .onAppear {
            isHubEditMode = model.isEditMode
        }
        .tabDockAction(
            tag: .hub,
            isActive: !model.isEditMode && env.session.clientFlags.isAiScanReceiptEnabled
        ) {
            IconFABButtonCore(
                systemImage: "camera.viewfinder",
                accessibilityLabel: "Scan items",
                isAI: true,
                action: onScan
            )
        }
    }

    private func reload() async {
        guard let organizationId else { return }
        model.refreshOutcomes = env.refreshOutcomes
        await env.loadSnapshot(organizationId: organizationId, domain: SnapshotDomain.hub) {
            await model.load(
                api: env.api,
                snapshots: env.snapshots,
                online: env.network.isOnline,
                organizationId: organizationId
            )
        }
    }

    private func hubContent(_ data: HubResponse) -> some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 16) {
                    if let toggleError = model.toggleErrorMessage {
                        ErrorBanner(message: toggleError).frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let organizationId {
                        let welcomeKey = "welcome12"
                        let showWelcome =
                            env.session.credits > 0
                            && !env.nextActionDismiss.isDismissed(
                                actionKey: welcomeKey,
                                organizationId: organizationId
                            )
                        if showWelcome {
                            welcomeCreditsCard(credits: env.session.credits, organizationId: organizationId)
                        } else if let action = model.nextAction(for: data),
                                  !env.nextActionDismiss.isDismissed(
                                      actionKey: action.key,
                                      organizationId: organizationId
                                  )
                        {
                            nextActionCard(action, organizationId: organizationId)
                        }
                    }

                    ForEach(model.resolvedLayout) { widget in
                        widgetView(widget, data: data)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, minHeight: geometry.size.height + 1)
                .copilotDockContentPadding()
            }
            .refreshable {
                await reload()
            }
            .scrollDismissesKeyboard(.interactively)
            .copilotScrollTracked(tab: .hub, isActive: isTabActive)
        }
    }

    private func welcomeCreditsCard(credits: Int, organizationId: String) -> some View {
        GlassCard {
            HStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .font(.title2)
                    .foregroundStyle(Theme.hyperGreen)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Welcome credits").rationCaption()
                    Text("You have \(credits) credits").rationHeadline()
                    Text("Try Scan or Ask to use credits on AI features.")
                        .rationCaption()
                }
                Spacer()
                Button {
                    env.nextActionDismiss.dismiss(actionKey: "welcome12", organizationId: organizationId)
                    Haptics.light()
                } label: {
                    Image(systemName: "xmark")
                        .foregroundStyle(Theme.muted)
                }
                .accessibilityLabel("Dismiss")
            }
        }
    }

    @ViewBuilder
    private func widgetView(_ widget: HubWidgetLayout, data: HubResponse) -> some View {
        let widgetID = HubWidgetID(rawValue: widget.id) ?? .hubStats
        let def = HubWidgetRegistry.definitions[widgetID]
        let size = HubLayoutEngine.resolvedSize(widget.size, defaultSize: def?.defaultSize ?? "md")
        let itemLimit = HubLayoutEngine.displayLimit(filters: widget.filters, size: widget.size)
        switch widgetID {
        case .hubStats:
            HubStatsWidget(data: data, size: size, onOpenCargo: onOpenCargo, onOpenExpiring: onOpenCargo, onOpenGalley: onOpenGalley, onOpenSupply: onOpenSupply)
        case .mealsReady:
            MealsReadyWidget(matches: data.mealMatches, itemLimit: itemLimit) { meal in
                selectedMealRoute = HubMealRoute(meal: meal)
            }
        case .mealsPartial:
            MealsPartialWidget(matches: data.partialMealMatches, itemLimit: itemLimit) { meal in
                selectedMealRoute = HubMealRoute(meal: meal)
            }
        case .snacksReady:
            MealsReadyWidget(title: "Snacks ready", matches: data.snackMatches, itemLimit: itemLimit) { meal in
                selectedMealRoute = HubMealRoute(meal: meal)
            }
        case .cargoExpiring:
            CargoExpiringWidget(
                items: data.expiringItems,
                alertDays: data.expirationAlertDays,
                itemLimit: itemLimit
            ) { item in
                selectedCargoRoute = HubCargoRoute(id: item.id)
            }
        case .supplyPreview:
            SupplyPreviewWidget(
                list: data.latestSupplyList,
                cargoLinkRows: (data.cargoTagIndex ?? []).map { CargoLinkResolver.Row(id: $0.id, name: $0.name) },
                itemLimit: itemLimit,
                onToggleItem: { item, purchased in
                    guard let organizationId = env.session.activeOrganizationId else { return }
                    await model.toggleSupplyItem(
                        item,
                        isPurchased: purchased,
                        api: env.api,
                        snapshots: env.snapshots,
                        online: env.network.isOnline,
                        organizationId: organizationId
                    )
                },
                onOpenSupply: onOpenSupply,
                onSelectCargo: { cargoId in
                    selectedCargoRoute = HubCargoRoute(id: cargoId)
                }
            )
        case .manifestPreview:
            ManifestPreviewWidget(
                preview: data.manifestPreview,
                daySpan: HubLayoutEngine.resolvedDaySpan(filters: widget.filters),
                onSelectEntry: { entry in
                    selectedMealRoute = HubMealRoute(meal: entry.stubMeal())
                },
                onOpenManifest: onOpenManifest
            )
        }
    }

    private func nextActionCard(
        _ action: (key: String, title: String, detail: String, icon: String),
        organizationId: String
    ) -> some View {
        GlassCard {
            HStack(spacing: 12) {
                Image(systemName: action.icon)
                    .font(.title2)
                    .foregroundStyle(Theme.hyperGreen)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Next action").rationCaption()
                    Text(action.title).rationHeadline()
                    Text(action.detail).rationCaption()
                }
                Spacer()
                Button {
                    env.nextActionDismiss.dismiss(actionKey: action.key, organizationId: organizationId)
                    Haptics.light()
                } label: {
                    Image(systemName: "xmark")
                        .foregroundStyle(Theme.muted)
                }
                .accessibilityLabel("Dismiss")
            }
        }
    }
}

private struct HubCargoRoute: Identifiable, Hashable {
    let id: String
}

private struct HubMealRoute: Identifiable, Hashable {
    let meal: Meal
    var id: String { meal.id }

    static func == (lhs: HubMealRoute, rhs: HubMealRoute) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

private extension ManifestPreviewEntry {
    func stubMeal() -> Meal {
        Meal(
            id: mealId,
            organizationId: "",
            name: mealName,
            domain: "food",
            type: mealType ?? "dinner",
            description: nil,
            directions: nil,
            equipment: [],
            servings: servingsOverride,
            prepTime: nil,
            cookTime: nil,
            createdAt: Date(),
            updatedAt: Date(),
            tags: [],
            ingredients: []
        )
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let tint: Color

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon).foregroundStyle(tint)
                Text(value).font(Typography.display()).foregroundStyle(tint)
                Text(title).rationCaption()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
