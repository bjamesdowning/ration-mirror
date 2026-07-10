import SwiftUI

/// Auth gate — routes between launch splash, sign-in, onboarding, and the main tab shell.
struct RootView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var showOnboarding = false
    @State private var settingsLoaded = false

    var body: some View {
        switch env.auth.phase {
        case .loading:
            LoadingView(label: "Calibrating…")
        case .signedOut:
            SignInView()
        case .signedIn:
            MainTabView()
                .task {
                    // `session.load` and the settings fetch hit independent
                    // endpoints — run them concurrently rather than back to
                    // back. The single settings response feeds both the AI
                    // consent flag (H-8) and the onboarding check, instead of
                    // each fetching `/settings` on its own.
                    async let sessionLoad: Void = env.session.load(api: env.api)
                    async let settingsLoad: Void = loadSettings()
                    _ = await (sessionLoad, settingsLoad)
                }
                .fullScreenCover(isPresented: $showOnboarding) {
                    OnboardingView {
                        showOnboarding = false
                    }
                }
        }
    }

    @MainActor
    private func loadSettings() async {
        guard !settingsLoaded else { return }
        settingsLoaded = true
        do {
            let settings = try await env.api.settings().settings
            env.session.applyConsent(settings)
            env.theme.syncFromServer(settings)
            env.unitDisplayMode.syncFromServer(settings)
            let completed = settings.onboardingCompletedAt?.isEmpty == false
            showOnboarding = !completed
        } catch {
            showOnboarding = false
        }
    }
}

/// Bottom tab navigation — Hub, Cargo, Galley, Manifest, Supply.
struct MainTabView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var showingSettings = false
    @State private var showingScan = false
    @State private var orgGeneration = 0
    @State private var selectedTab = 0
    @State private var manifestSuccessMessage: String?
    @State private var showingCopilotPaywall = false

    private var organizationId: String {
        env.session.activeOrganizationId ?? "unknown"
    }

    private var isCopilotExhausted: Bool {
        CopilotAutoExpandPolicy.isCopilotExhausted(status: env.ask.model.status)
    }

    private var showCopilotBar: Bool {
        !showingSettings && !showingScan && !env.ask.isSheetPresented
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView(
                onScan: { showingScan = true },
                onOpenSettings: { showingSettings = true },
                onOpenSupply: { selectedTab = 4 },
                onOpenCargo: { selectedTab = 1 },
                onOpenGalley: { selectedTab = 2 },
                onOpenManifest: { selectedTab = 3 }
            )
                .id(orgGeneration)
                .tabItem { Label("Hub", systemImage: "square.grid.2x2") }
                .tag(0)

            CargoListView(onScan: { showingScan = true }, onOpenSettings: { showingSettings = true })
                .id(orgGeneration)
                .tabItem { Label("Cargo", systemImage: "shippingbox") }
                .tag(1)

            GalleyView(onOpenSettings: { showingSettings = true })
                .id(orgGeneration)
                .tabItem { Label("Galley", systemImage: "fork.knife") }
                .tag(2)

            ManifestView(
                onOpenSettings: { showingSettings = true },
                onPlanWeekComplete: { count in
                    selectedTab = 3
                    manifestSuccessMessage = "Added \(count) meals to Manifest"
                }
            )
                .id(orgGeneration)
                .tabItem { Label("Manifest", systemImage: "calendar") }
                .tag(3)

            SupplyView(onOpenSettings: { showingSettings = true })
                .id(orgGeneration)
                .tabItem { Label("Supply", systemImage: "cart") }
                .tag(4)
        }
        .environment(env.ask)
        .environment(env.copilotScroll)
        .environment(env.tabDock)
        .sheet(isPresented: $showingSettings) {
            SettingsView()
        }
        .sheet(isPresented: $showingCopilotPaywall) {
            PaywallView()
        }
        .sheet(isPresented: $showingScan) {
            ScanView()
        }
        .sheet(isPresented: Binding(
            get: { env.ask.isSheetPresented },
            set: { presented in
                if presented {
                    env.ask.openSheet()
                } else {
                    env.ask.closeSheet()
                }
            }
        )) {
            AskView()
                .environment(env.ask)
        }
        .overlay(alignment: .top) {
            if !env.network.isOnline {
                OfflineBanner(label: "Offline — showing cached data where available")
            }
        }
        .overlay(alignment: .bottom) {
            if let message = manifestSuccessMessage {
                TransientSuccessToast(message: message) {
                    manifestSuccessMessage = nil
                }
                .padding(
                    .bottom,
                    CopilotDockLayout.toastBottomOffset(
                        isExpanded: env.copilotScroll.isExpanded,
                        hasTabAction: env.tabDock.hasAction(for: selectedTab)
                    )
                )
            }
        }
        .overlay(alignment: .bottom) {
            if showCopilotBar {
                CopilotBottomDock(
                    scrollContext: env.copilotScroll,
                    tabDock: env.tabDock,
                    selectedTab: selectedTab,
                    isExhausted: isCopilotExhausted,
                    onOpenSheet: { env.ask.openSheet() },
                    onSend: { text in
                        Task {
                            await env.ask.sendFromBar(
                                text,
                                api: env.api,
                                auth: env.auth,
                                organizationId: organizationId,
                                snapshots: env.snapshots
                            )
                            env.copilotScroll.collapse()
                        }
                    },
                    onExhaustedTap: { showingCopilotPaywall = true }
                )
                .padding(
                    .bottom,
                    max(CopilotDockLayout.tabBarClearance, env.copilotScroll.keyboardInset)
                )
            }
        }
        .copilotKeyboardObserved(env.copilotScroll)
        .copilotKeyboardDismissOverlay(env.copilotScroll)
        .task {
            await env.session.load(api: env.api)
            guard organizationId != "unknown" else { return }
            await env.ask.load(
                api: env.api,
                auth: env.auth,
                organizationId: organizationId,
                snapshots: env.snapshots
            )
            env.ask.updateAutoExpandPolicy(scrollContext: env.copilotScroll)
        }
        .onChange(of: env.session.orgGeneration) { _, newValue in
            orgGeneration = newValue
            env.copilotScroll.resetForTabChange()
            Task {
                guard let organizationId = env.session.activeOrganizationId else { return }
                await env.ask.load(
                    api: env.api,
                    auth: env.auth,
                    organizationId: organizationId,
                    snapshots: env.snapshots
                )
                env.ask.updateAutoExpandPolicy(scrollContext: env.copilotScroll)
            }
        }
        .onChange(of: selectedTab) { _, _ in
            env.copilotScroll.resetForTabChange()
            env.ask.updateAutoExpandPolicy(scrollContext: env.copilotScroll)
        }
        .onChange(of: env.deepLinkDestination) { _, destination in
            guard let destination else { return }
            switch destination {
            case .ask:
                env.ask.openSheet()
            case .scan:
                showingScan = true
            case .galleyGenerate, .galleyImport:
                selectedTab = 2
            case .manifestPlanWeek:
                selectedTab = 3
            }
            env.consumeDeepLink()
        }
    }
}

struct OfflineBanner: View {
    let label: String

    var body: some View {
        Text(label)
            .font(Typography.caption())
            .foregroundStyle(Theme.carbon)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(Theme.warning.opacity(0.2))
            .accessibilityAddTraits(.isHeader)
    }
}

/// Profile / settings affordance shared across tabs.
struct ProfileToolbarButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "person.crop.circle")
        }
        .accessibilityLabel("Account and settings")
    }
}
