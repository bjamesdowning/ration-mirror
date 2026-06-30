import SwiftUI
import Observation

struct DashboardView: View {
    @Environment(AppEnvironment.self) private var env
    var onScan: () -> Void = {}
    var onOpenSettings: () -> Void = {}
    var onOpenSupply: () -> Void = {}
    var onOpenCargo: () -> Void = {}
    var onOpenGalley: () -> Void = {}
    var onOpenManifest: () -> Void = {}
    @State private var model = HubViewModel()
    @State private var showingEdit = false
    @State private var selectedCargoRoute: HubCargoRoute?
    @State private var selectedMealRoute: HubMealRoute?
    @State private var selectedManifestEntry: ManifestPreviewEntry?

    private var organizationId: String {
        env.session.activeOrganizationId ?? "unknown"
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
            .safeAreaInset(edge: .bottom) {
                if !model.isEditMode {
                    IconFABButton(
                        systemImage: "camera.viewfinder",
                        accessibilityLabel: "Scan receipt",
                        isAI: true,
                        action: onScan
                    )
                }
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
            .sheet(item: $selectedManifestEntry) { entry in
                ManifestEntryDetailSheet(entry: entry) {
                    await reload()
                }
            }
        }
        .task(id: organizationId) {
            await reload()
        }
        .refreshable {
            await reload()
        }
    }

    private func reload() async {
        await model.load(
            api: env.api,
            snapshots: env.snapshots,
            online: env.network.isOnline,
            organizationId: organizationId
        )
    }

    private func hubContent(_ data: HubResponse) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                if let toggleError = model.toggleErrorMessage {
                    ErrorBanner(message: toggleError).frame(maxWidth: .infinity, alignment: .leading)
                }

                if let action = model.nextAction(for: data),
                   !env.nextActionDismiss.isDismissed(actionKey: action.key, organizationId: organizationId)
                {
                    nextActionCard(action)
                }

                ForEach(model.resolvedLayout) { widget in
                    widgetView(widget, data: data)
                }
            }
            .padding(16)
        }
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
            SupplyPreviewWidget(list: data.latestSupplyList, size: size, onToggleItem: { item, purchased in
                    await model.toggleSupplyItem(
                        item,
                        isPurchased: purchased,
                        api: env.api,
                        snapshots: env.snapshots,
                        online: env.network.isOnline,
                        organizationId: organizationId
                    )
                },
                onOpenSupply: onOpenSupply
            )
        case .manifestPreview:
            ManifestPreviewWidget(
                preview: data.manifestPreview,
                daySpan: widget.filters?.daySpan ?? 3,
                size: size,
                onSelectEntry: { entry in
                    selectedManifestEntry = entry
                },
                onOpenManifest: onOpenManifest
            )
        }
    }

    private func nextActionCard(_ action: (key: String, title: String, detail: String, icon: String)) -> some View {
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

private struct HubCargoRoute: Identifiable {
    let id: String
}

private struct HubMealRoute: Identifiable {
    let meal: Meal
    var id: String { meal.id }
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
