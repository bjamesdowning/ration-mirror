import SwiftUI
import Observation

struct DashboardView: View {
    @Environment(AppEnvironment.self) private var env
    var isTabActive: Bool = true
    /// Bumped when the Hub tab is re-tapped while already selected (exits edit mode).
    var hubTabReselectToken: Int = 0
    @Binding var isHubEditMode: Bool
    /// False while the Fuel tab owns the shared hub dock slot.
    var hubDockVisible: Bool = true
    var onScan: () -> Void = {}
    var onOpenSettings: () -> Void = {}
    var onOpenGroupSettings: () -> Void = {}
    var onOpenSupply: () -> Void = {}
    var onOpenCargo: () -> Void = {}
    var onOpenGalley: () -> Void = {}
    var onOpenManifest: () -> Void = {}
    var onOpenNutritionGoals: () -> Void = {}
    @State private var model = HubViewModel()
    @State private var showLogToFuel = false

    private var hubMenuVisibility: HubCapturePolicy.Visibility {
        HubCapturePolicy.Visibility(
            logToFuel: fuelCapture,
            scanToCargo: env.session.clientFlags.isAiScanReceiptEnabled,
            generateMeal: env.session.clientFlags.isAiGenerateMealEnabled,
            planWeek: env.session.clientFlags.isAiPlanWeekEnabled,
            dockFromReceipt: env.session.clientFlags.isAiDockFromReceiptEnabled
        )
    }

    @ViewBuilder
    private func hubActionButton(_ label: String) -> some View {
        switch label {
        case HubCapturePolicy.logToFuel:
            Button { showLogToFuel = true } label: {
                Label(
                    label,
                    systemImage: PlanFuelNames.snapshot(
                        planFuelActions: env.session.clientFlags.isPlanFuelActionsEnabled
                    ).logToFuelSymbol
                )
            }
        case HubCapturePolicy.scanToCargo:
            Button(action: onScan) {
                Label(label, systemImage: "camera.viewfinder")
            }
        case HubCapturePolicy.generateMeal:
            Button { env.openDeepLink(.galleyGenerate) } label: {
                Label(label, systemImage: "sparkles")
            }
        case HubCapturePolicy.planWeek:
            Button { env.openDeepLink(.manifestPlanWeek) } label: {
                Label(label, systemImage: "sparkles")
            }
        case HubCapturePolicy.dockFromReceipt:
            Button { env.openDeepLink(.supplyDockReceipt) } label: {
                Label(label, systemImage: "camera.fill")
            }
        default:
            EmptyView()
        }
    }

    private var fuelCapture: Bool {
        HubCapturePolicy.choiceVisible(
            fastLogEnabled: env.session.clientFlags.isNutritionFastLogEnabled,
            appVersion: AppMarketingVersion.current
        )
    }

    private var organizationId: String? {
        env.session.activeOrganizationId
    }

    private var loadTaskKey: String {
        "\(organizationId ?? "nil")-\(isTabActive)-\(env.lifecycle.refreshToken(forTab: .hub))"
    }

    var body: some View {
        NavigationStack {
            hubPage
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
            isActive: HubShellPolicy.hubDockActive(
                showingHub: hubDockVisible,
                editing: model.isEditMode,
                menu: HubCapturePolicy.menuActive(hubMenuVisibility)
            )
        ) {
            IconFABMenuCore(systemImage: "plus.circle.fill", accessibilityLabel: "Hub actions") {
                ForEach(HubCapturePolicy.visibleLabels(hubMenuVisibility), id: \.self) { label in
                    hubActionButton(label)
                }
            }
        }
        .sheet(isPresented: $showLogToFuel) {
            LogToFuelSheet(onClose: { showLogToFuel = false }, onSaved: {
                Task { await reload() }
            })
        }
    }

    private var hubPage: some View {
        hubCanvas
            .navigationTitle(model.isEditMode ? "Edit Hub" : "Hub")
            .rationLargeTitle()
            .ceramicPageChrome()
            .toolbar { hubToolbar }
    }

    @ViewBuilder
    private var hubCanvas: some View {
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
                    onSave: saveHubLayout,
                    onSaveProfile: saveHubProfile,
                    saves: model.layoutSaves
                )
            } else {
                hubContent(data)
            }
        }
    }

    @ToolbarContentBuilder
    private var hubToolbar: some ToolbarContent {
        GlobalPageToolbar(
            syncDomain: SnapshotDomain.hub,
            organizationId: organizationId,
            isRefreshing: model.isRefreshing,
            showsHubButton: false,
            showsHubAvatar: model.state.isLoaded,
            isHubEditing: model.isEditMode,
            hubSaveInFlight: model.layoutSaves.isSaving,
            onEditHub: model.state.isLoaded && !model.isEditMode ? beginHubEdit : nil,
            onFinishHubEdit: { Task { await finishHubEdit() } },
            onOpenSettings: onOpenSettings
        )
    }

    private func beginHubEdit() {
        model.isEditMode = true
    }

    private func saveHubLayout(_ widgets: [HubWidgetLayout]) async throws {
        try await model.saveLayout(widgets, api: env.api)
        await reload()
    }

    private func saveHubProfile(_ profile: HubProfile) async throws {
        try await model.saveProfile(profile, api: env.api)
        await reload()
    }

    private func finishHubEdit() async {
        await model.layoutSaves.finish()
        guard model.layoutSaves.lastError == nil else { return }
        model.isEditMode = false
        await reload()
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

                    ForEach(model.resolvedLayout()) { widget in
                        widgetView(widget, data: data)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, minHeight: geometry.size.height + 1, alignment: .top)
            }
            .copilotDockContentPadding()
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
            MealsReadyWidget(
                matches: data.mealMatches,
                itemLimit: itemLimit,
                onSelectMeal: { meal in env.openDeepLink(.meal(id: meal.id)) },
                onOpenList: onOpenGalley
            )
        case .mealsPartial:
            MealsPartialWidget(
                matches: data.partialMealMatches,
                itemLimit: itemLimit,
                onSelectMeal: { meal in env.openDeepLink(.meal(id: meal.id)) },
                onOpenList: onOpenGalley
            )
        case .snacksReady:
            MealsReadyWidget(
                title: "Snacks ready",
                matches: data.snackMatches,
                itemLimit: itemLimit,
                onSelectMeal: { meal in env.openDeepLink(.meal(id: meal.id)) },
                onOpenList: onOpenGalley
            )
        case .cargoExpiring:
            CargoExpiringWidget(
                items: data.expiringItems,
                alertDays: data.expirationAlertDays,
                itemLimit: itemLimit,
                onSelectItem: { item in env.openDeepLink(.cargoItem(id: item.id)) },
                onOpenList: onOpenCargo
            )
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
                    env.openDeepLink(.cargoItem(id: cargoId))
                }
            )
        case .manifestPreview:
            ManifestPreviewWidget(
                preview: data.manifestPreview,
                daySpan: HubLayoutEngine.resolvedDaySpan(filters: widget.filters),
                onSelectEntry: { entry in
                    env.openDeepLink(.meal(id: entry.mealId))
                },
                onOpenManifest: onOpenManifest
            )
        case .flightRecorder:
            FlightRecorderWidget(activity: data.flightRecorderActivity, size: size)
        case .nutritionToday:
            DailyFuelWidget(
                summary: data.nutritionToday,
                size: size,
                filters: widget.filters,
                onOpenGoals: {
                    if env.session.clientFlags.isNutritionFuelPageEnabled {
                        env.openDeepLink(.fuelGoals)
                    } else {
                        onOpenNutritionGoals()
                    }
                },
                opensDay: fuelCapture || env.session.clientFlags.isNutritionFuelPageEnabled,
                onOpenDay: {
                    if env.session.clientFlags.isNutritionFuelPageEnabled {
                        env.openDeepLink(.fuel)
                    } else {
                        onOpenManifest()
                    }
                }
            )
        case .nutritionTrends:
            FuelTrendsWidget(
                summary: data.nutritionTrends,
                size: size,
                filters: widget.filters,
                onOpenGoals: {
                    switch HubWidgetRoute.fuelTrends(
                        fuelPageOn: env.session.clientFlags.isNutritionFuelPageEnabled
                    ) {
                    case .fuel:
                        env.openDeepLink(.fuel)
                    case .nutritionGoals:
                        onOpenNutritionGoals()
                    case .supply, .none:
                        break
                    }
                }
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
