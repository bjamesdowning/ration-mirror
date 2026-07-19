import SwiftUI

/// Auth gate — routes between launch splash, sign-in, onboarding, and the main tab shell.
struct RootView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var onboardingTransition: AnyTransition {
        reduceMotion
            ? .opacity
            : .opacity.combined(with: .scale(scale: 0.98))
    }

    var body: some View {
        switch env.auth.phase {
        case .loading:
            LoadingView(label: "Calibrating…")
        case .signedOut:
            SignInView()
        case .signedIn:
            Group {
                switch env.launch.phase {
                case .idle, .loading:
                    LoadingView(label: "Calibrating…")
                case let .failed(message):
                    VStack(spacing: 16) {
                        ErrorBanner(message: message)
                        Button("Try again") {
                            env.launch.retry()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(24)
                    .background(Theme.ceramic)
                case .ready:
                    Group {
                        if env.launch.needsOnboarding, !env.session.needsOrgSelection {
                            OnboardingBriefingView()
                                .environment(env.ask)
                                .transition(onboardingTransition)
                        } else {
                            MainTabView()
                                .transition(onboardingTransition)
                        }
                    }
                    .animation(MotionPolicy.shortFade, value: env.launch.needsOnboarding)
                }
            }
            .fullScreenCover(isPresented: Binding(
                get: { env.session.needsOrgSelection },
                set: { _ in }
            )) {
                SelectGroupView()
            }
            .task(id: env.launch.startupGeneration) {
                await env.launch.performStartup(
                    api: env.api,
                    session: env.session,
                    theme: env.theme,
                    unitDisplayMode: env.unitDisplayMode
                )
                guard !Task.isCancelled, env.launch.isStartupComplete else { return }
                if env.launch.needsOnboarding {
                    env.onboarding.startIfNeeded(
                        completedAt: env.launch.userSettings?.onboardingCompletedAt,
                        settings: env.launch.userSettings
                    )
                    if !env.session.clientFlags.isRationCopilotEnabled {
                        env.onboarding.preferStaticBriefing()
                    }
                } else {
                    env.onboarding.reset()
                }
            }
        }
    }
}

/// Bottom tab navigation — Hub, Cargo, Galley, Manifest, Supply.
struct MainTabView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.scenePhase) private var scenePhase
    @State private var showingSettings = false
    @State private var showingGroupSettings = false
    @State private var showingScan = false
    @State private var orgGeneration = 0
    @State private var selectedTab = 0
    @State private var activatedTabs: Set<Int> = [0]
    @State private var hubTabReselectToken = 0
    @State private var isHubEditMode = false
    @State private var manifestSuccessMessage: String?
    @State private var showingCopilotPaywall = false

    private var isCopilotExhausted: Bool {
        CopilotAutoExpandPolicy.isCopilotExhausted(status: env.ask.model.status)
    }

    private var showCopilotBar: Bool {
        env.session.clientFlags.isRationCopilotEnabled
            && !showingSettings
            && !showingGroupSettings
            && !showingScan
            && !env.ask.isSheetPresented
            // Only suppress on Hub while editing — other tabs keep Copilot.
            && !(isHubEditMode && selectedTab == 0)
    }

    private var canOpenScan: Bool {
        env.session.clientFlags.isAiScanReceiptEnabled
    }

    private var canOpenAsk: Bool {
        env.session.clientFlags.isRationCopilotEnabled
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView(
                isTabActive: activatedTabs.contains(0),
                hubTabReselectToken: hubTabReselectToken,
                isHubEditMode: $isHubEditMode,
                onScan: {
                    guard canOpenScan else { return }
                    showingScan = true
                },
                onOpenSettings: { showingSettings = true },
                onOpenGroupSettings: { showingGroupSettings = true },
                onOpenSupply: { selectedTab = 4 },
                onOpenCargo: { selectedTab = 1 },
                onOpenGalley: { selectedTab = 2 },
                onOpenManifest: { selectedTab = 3 }
            )
                .id(orgGeneration)
                .tabItem { Label("Hub", systemImage: "square.grid.2x2") }
                .tag(0)

            CargoListView(
                isTabActive: activatedTabs.contains(1),
                onScan: {
                    guard canOpenScan else { return }
                    showingScan = true
                },
                onOpenSettings: { showingSettings = true },
                onOpenGroupSettings: { showingGroupSettings = true }
            )
                .id(orgGeneration)
                .tabItem { Label("Cargo", systemImage: "shippingbox") }
                .tag(1)

            GalleyView(
                isTabActive: activatedTabs.contains(2),
                onOpenSettings: { showingSettings = true },
                onOpenGroupSettings: { showingGroupSettings = true }
            )
                .id(orgGeneration)
                .tabItem { Label("Galley", systemImage: "fork.knife") }
                .tag(2)

            ManifestView(
                isTabActive: activatedTabs.contains(3),
                onOpenSettings: { showingSettings = true },
                onOpenGroupSettings: { showingGroupSettings = true },
                onPlanWeekComplete: { count in
                    selectedTab = 3
                    manifestSuccessMessage = "Added \(count) meals to Manifest"
                }
            )
                .id(orgGeneration)
                .tabItem { Label("Manifest", systemImage: "calendar") }
                .tag(3)

            SupplyView(
                isTabActive: activatedTabs.contains(4),
                onOpenSettings: { showingSettings = true },
                onOpenGroupSettings: { showingGroupSettings = true }
            )
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
        .sheet(isPresented: $showingGroupSettings) {
            NavigationStack {
                GroupSettingsView()
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") { showingGroupSettings = false }
                        }
                    }
            }
        }
        .sheet(isPresented: $showingCopilotPaywall) {
            PaywallView()
        }
        .sheet(isPresented: $showingScan) {
            ScanView()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if showCopilotBar {
                CopilotBottomDock(
                    scrollContext: env.copilotScroll,
                    tabDock: env.tabDock,
                    selectedTab: selectedTab,
                    draft: Binding(
                        get: { env.ask.draft },
                        set: { env.ask.draft = $0 }
                    ),
                    isExhausted: isCopilotExhausted,
                    isTurnActive: env.ask.model.isTurnActive,
                    isStopping: env.ask.model.isStopping,
                    isAwaitingApproval: env.ask.model.isAwaitingApproval,
                    onOpenSheet: {
                        guard let organizationId = env.session.activeOrganizationId else {
                            env.ask.openSheet()
                            return
                        }
                        Task {
                            await env.ask.prepareSheetPresentation(
                                auth: env.auth,
                                organizationId: organizationId,
                                snapshots: env.snapshots
                            )
                        }
                    },
                    onSend: { text in
                        guard let organizationId = env.session.activeOrganizationId else { return false }
                        let accepted = await env.ask.sendFromBar(
                            text,
                            api: env.api,
                            auth: env.auth,
                            organizationId: organizationId,
                            snapshots: env.snapshots
                        )
                        return accepted
                    },
                    onStop: { await env.ask.model.stop() },
                    onExhaustedTap: { showingCopilotPaywall = true }
                )
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { canOpenAsk && env.ask.isSheetPresented },
            set: { presented in
                if presented {
                    guard canOpenAsk else { return }
                    if let organizationId = env.session.activeOrganizationId {
                        Task {
                            await env.ask.prepareSheetPresentation(
                                auth: env.auth,
                                organizationId: organizationId,
                                snapshots: env.snapshots
                            )
                        }
                    } else {
                        env.ask.openSheet()
                    }
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
                        hasTabAction: env.tabDock.hasAction(for: selectedTab),
                        keyboardInset: 0
                    )
                )
            }
        }
        .copilotKeyboardObserved(env.copilotScroll)
        .copilotKeyboardDismissOverlay(
            env.copilotScroll,
            hasTabAction: env.tabDock.hasAction(for: selectedTab)
        )
        .background {
            TabBarReselectObserver { index in
                if index == 0 {
                    hubTabReselectToken += 1
                }
            }
        }
        .onChange(of: selectedTab) { _, tab in
            activatedTabs.insert(tab)
            env.copilotScroll.setActiveTab(tab)
            env.copilotScroll.resetForTabChange()
            env.ask.updateAutoExpandPolicy(scrollContext: env.copilotScroll)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            env.lifecycle.recordBecameActive()
            Task {
                try? await Task.sleep(nanoseconds: 500_000_000)
                guard scenePhase == .active else { return }
                env.lifecycle.bumpRefresh(forTab: selectedTab)
            }
        }
        .onChange(of: env.network.onlineGeneration) { _, _ in
            env.lifecycle.bumpRefresh(forTab: selectedTab)
        }
        .task(id: shellReadyKey) {
            guard let organizationId = env.session.activeOrganizationId else { return }
            await env.warmSnapshotMetadata(organizationId: organizationId)
            if canOpenAsk {
                await env.ask.load(
                    api: env.api,
                    auth: env.auth,
                    organizationId: organizationId,
                    snapshots: env.snapshots
                )
                env.ask.updateAutoExpandPolicy(scrollContext: env.copilotScroll)
            }
            env.copilotScroll.setActiveTab(selectedTab)
            env.deepLinkRouter.replayPending(
                selectedTab: &selectedTab,
                openAskSheet: {
                    guard canOpenAsk else { return }
                    guard let organizationId = env.session.activeOrganizationId else {
                        env.ask.openSheet()
                        return
                    }
                    Task {
                        await env.ask.prepareSheetPresentation(
                            auth: env.auth,
                            organizationId: organizationId,
                            snapshots: env.snapshots
                        )
                    }
                },
                openScan: {
                    guard canOpenScan else { return }
                    showingScan = true
                }
            )
            activatedTabs.insert(selectedTab)
        }
        .onChange(of: env.deepLinkRouter.pending) { _, destination in
            guard destination != nil, env.launch.isStartupComplete,
                  env.session.activeOrganizationId != nil
            else { return }
            env.deepLinkRouter.replayPending(
                selectedTab: &selectedTab,
                openAskSheet: {
                    guard canOpenAsk else { return }
                    guard let organizationId = env.session.activeOrganizationId else {
                        env.ask.openSheet()
                        return
                    }
                    Task {
                        await env.ask.prepareSheetPresentation(
                            auth: env.auth,
                            organizationId: organizationId,
                            snapshots: env.snapshots
                        )
                    }
                },
                openScan: {
                    guard canOpenScan else { return }
                    showingScan = true
                }
            )
            activatedTabs.insert(selectedTab)
        }
        .onChange(of: env.session.orgGeneration) { _, newValue in
            orgGeneration = newValue
            env.copilotScroll.resetForTabChange()
            Task {
                guard canOpenAsk else { return }
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
    }

    private var shellReadyKey: String {
        "\(env.launch.isStartupComplete)-\(env.launch.startupGeneration)-\(env.session.activeOrganizationId ?? "nil")-\(env.session.orgGeneration)"
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
