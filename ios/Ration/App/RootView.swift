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
                    async let settingsLoad = loadSettings()
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

            ManifestView(onOpenSettings: { showingSettings = true })
                .id(orgGeneration)
                .tabItem { Label("Manifest", systemImage: "calendar") }
                .tag(3)

            SupplyView(onOpenSettings: { showingSettings = true })
                .id(orgGeneration)
                .tabItem { Label("Supply", systemImage: "cart") }
                .tag(4)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
        }
        .sheet(isPresented: $showingScan) {
            ScanView()
        }
        .overlay(alignment: .top) {
            if !env.network.isOnline {
                OfflineBanner(label: "Offline — showing cached data where available")
            }
        }
        .task {
            await env.session.load(api: env.api)
        }
        .onChange(of: env.session.orgGeneration) { _, newValue in
            orgGeneration = newValue
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
