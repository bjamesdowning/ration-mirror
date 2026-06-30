import SwiftUI
import Observation

struct DashboardView: View {
    @Environment(AppEnvironment.self) private var env
    var onScan: () -> Void = {}
    var onOpenSettings: () -> Void = {}
    var onOpenSupply: () -> Void = {}
    @State private var model = HubViewModel()
    @State private var showingEdit = false

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
                            onSave: { widgets in
                                try await model.saveLayout(widgets, api: env.api)
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
                GlobalPageToolbar(onOpenSettings: onOpenSettings)
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
                    FloatingActionBar(actions: [
                        FloatingAction(id: "scan", systemImage: "camera.viewfinder", label: "Scan", action: onScan, isAI: true),
                    ])
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
                if let staleLabel = model.staleLabel {
                    Text(staleLabel).rationCaption().frame(maxWidth: .infinity, alignment: .leading)
                }

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
        switch HubWidgetID(rawValue: widget.id) {
        case .hubStats:
            HubStatsWidget(data: data)
        case .mealsReady:
            MealsReadyWidget(matches: data.mealMatches)
        case .mealsPartial:
            MealsPartialWidget(matches: data.partialMealMatches)
        case .snacksReady:
            MealsReadyWidget(matches: data.snackMatches)
        case .cargoExpiring:
            CargoExpiringWidget(items: data.expiringItems, alertDays: data.expirationAlertDays)
        case .supplyPreview:
            SupplyPreviewWidget(
                list: data.latestSupplyList,
                onToggleItem: { item, purchased in
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
            ManifestPreviewWidget(preview: data.manifestPreview)
        case .none:
            EmptyView()
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
