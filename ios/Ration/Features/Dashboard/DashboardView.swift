import SwiftUI
import Observation

struct DashboardView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(CopilotScrollContext.self) private var scrollContext
    var isTabActive: Bool = true
    var onScan: () -> Void = {}
    var onOpenSettings: () -> Void = {}
    var onOpenSupply: () -> Void = {}
    var onOpenCargo: () -> Void = {}
    var onOpenGalley: () -> Void = {}
    var onOpenManifest: () -> Void = {}
    @State private var model = HubViewModel()
    @State private var showingEdit = false
    @State private var editableWidgets: [HubWidgetLayout] = []
    @State private var selectedCargoRoute: HubCargoRoute?
    @State private var selectedMealRoute: HubMealRoute?
    @State private var draggingWidgetId: String?
    @State private var showGroupSettings = false

    private var organizationId: String? {
        env.session.activeOrganizationId
    }

    private var loadTaskKey: String {
        "\(organizationId ?? "nil")-\(isTabActive)"
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
                            },
                            onExit: {
                                model.isEditMode = false
                                Task { await reload() }
                            }
                        )
                    } else {
                        hubContent(data)
                    }
                }
            }
            .navigationTitle("Hub")
            .toolbar {
                GlobalPageToolbar(
                    syncDomain: SnapshotDomain.hub,
                    organizationId: organizationId,
                    onOpenGroupSettings: { showGroupSettings = true },
                    onOpenSettings: onOpenSettings
                )
                if case .loaded = model.state, !model.isEditMode {
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
            .navigationDestination(isPresented: $showGroupSettings) {
                GroupSettingsView()
            }
            .sheet(item: $selectedCargoRoute) { route in
                NavigationStack {
                    CargoDetailView(itemId: route.id)
                }
            }
            .sheet(item: $selectedMealRoute) { route in
                NavigationStack {
                    MealDetailView(mealId: route.meal.id, initialMeal: route.meal)
                }
            }
        }
        .task(id: loadTaskKey) {
            guard isTabActive, let organizationId else { return }
            await model.load(
                api: env.api,
                snapshots: env.snapshots,
                online: env.network.isOnline,
                organizationId: organizationId
            )
        }
        .refreshable {
            await reload()
        }
        .tabDockAction(tag: 0, isActive: !model.isEditMode) {
            IconFABButtonCore(
                systemImage: "camera.viewfinder",
                accessibilityLabel: "Scan receipt",
                isAI: true,
                action: onScan
            )
        }
    }

    private func reload() async {
        guard let organizationId else { return }
        await model.load(
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId
        )
    }

    private func reorderWidgets(
        sourceId: String,
        to destinationId: String,
        data: HubResponse
    ) async {
        var widgets = HubLayoutEngine.initEditableWidgets(
            profile: data.hubProfile,
            layout: data.hubLayout
        )
        widgets = HubLayoutEngine.reorderVisible(widgets, moving: sourceId, to: destinationId)
        do {
            try await model.saveLayout(widgets, api: env.api)
            Haptics.light()
            await reload()
        } catch {
            await reload()
        }
    }

    private func hubContent(_ data: HubResponse) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                if let toggleError = model.toggleErrorMessage {
                    ErrorBanner(message: toggleError).frame(maxWidth: .infinity, alignment: .leading)
                }

                if let organizationId,
                   let action = model.nextAction(for: data),
                   !env.nextActionDismiss.isDismissed(actionKey: action.key, organizationId: organizationId)
                {
                    nextActionCard(action, organizationId: organizationId)
                }

                ForEach(model.resolvedLayout) { widget in
                    widgetView(widget, data: data)
                        .opacity(draggingWidgetId == widget.id ? 0.55 : 1)
                        .scaleEffect(draggingWidgetId == widget.id ? 1.02 : 1)
                        .shadow(
                            color: draggingWidgetId == widget.id ? Theme.carbon.opacity(0.1) : .clear,
                            radius: 10,
                            y: 4
                        )
                        .onDrag {
                            draggingWidgetId = widget.id
                            return NSItemProvider(object: widget.id as NSString)
                        }
                        .onDrop(
                            of: [.text],
                            delegate: HubWidgetDropDelegate(
                                widgetId: widget.id,
                                draggingId: $draggingWidgetId,
                                onDrop: { sourceId, destinationId in
                                    Task {
                                        await reorderWidgets(
                                            sourceId: sourceId,
                                            to: destinationId,
                                            data: data
                                        )
                                    }
                                }
                            )
                        )
                }
            }
            .padding(16)
            .copilotDockScrollMargins(
                isExpanded: scrollContext.isExpanded,
                hasTabAction: !model.isEditMode
            )
        }
        .scrollDismissesKeyboard(.interactively)
        .copilotDismissKeyboardOnTap()
        .copilotScrollTracked()
    }

    @ViewBuilder
    private func widgetView(_ widget: HubWidgetLayout, data: HubResponse) -> some View {
        let widgetID = HubWidgetID(rawValue: widget.id) ?? .hubStats
        let def = HubWidgetRegistry.definitions[widgetID]
        let size = HubLayoutEngine.resolvedSize(widget.size, defaultSize: def?.defaultSize ?? "md")
        switch widgetID {
        case .hubStats:
            HubStatsWidget(data: data, size: size, onOpenCargo: onOpenCargo, onOpenExpiring: onOpenCargo, onOpenGalley: onOpenGalley, onOpenSupply: onOpenSupply)
        case .mealsReady:
            MealsReadyWidget(matches: data.mealMatches, size: size) { meal in
                selectedMealRoute = HubMealRoute(meal: meal)
            }
        case .mealsPartial:
            MealsPartialWidget(matches: data.partialMealMatches, size: size) { meal in
                selectedMealRoute = HubMealRoute(meal: meal)
            }
        case .snacksReady:
            MealsReadyWidget(title: "Snacks ready", matches: data.snackMatches, size: size) { meal in
                selectedMealRoute = HubMealRoute(meal: meal)
            }
        case .cargoExpiring:
            CargoExpiringWidget(items: data.expiringItems, alertDays: data.expirationAlertDays, size: size) { item in
                selectedCargoRoute = HubCargoRoute(id: item.id)
            }
        case .supplyPreview:
            SupplyPreviewWidget(
                list: data.latestSupplyList,
                cargoLinkRows: (data.cargoTagIndex ?? []).map { CargoLinkResolver.Row(id: $0.id, name: $0.name) },
                size: size,
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
                daySpan: widget.filters?.daySpan ?? 3,
                size: size,
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

private struct HubWidgetDropDelegate: DropDelegate {
    let widgetId: String
    @Binding var draggingId: String?
    let onDrop: (String, String) -> Void

    func performDrop(info: DropInfo) -> Bool {
        guard let sourceId = draggingId, sourceId != widgetId else {
            draggingId = nil
            return false
        }
        onDrop(sourceId, widgetId)
        draggingId = nil
        Haptics.light()
        return true
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }
}

private struct HubCargoRoute: Identifiable {
    let id: String
}

private struct HubMealRoute: Identifiable {
    let meal: Meal
    var id: String { meal.id }
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
