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
                    await env.session.load(api: env.api)
                    await evaluateOnboarding()
                }
                .fullScreenCover(isPresented: $showOnboarding) {
                    OnboardingView {
                        showOnboarding = false
                    }
                }
        }
    }

    @MainActor
    private func evaluateOnboarding() async {
        guard !settingsLoaded else { return }
        settingsLoaded = true
        do {
            let response = try await env.api.settings()
            let completed = response.settings.onboardingCompletedAt?.isEmpty == false
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

    var body: some View {
        TabView {
            DashboardView(onScan: { showingScan = true }, onOpenSettings: { showingSettings = true })
                .id(orgGeneration)
                .tabItem { Label("Hub", systemImage: "square.grid.2x2") }

            CargoListView(onScan: { showingScan = true }, onOpenSettings: { showingSettings = true })
                .id(orgGeneration)
                .tabItem { Label("Cargo", systemImage: "shippingbox") }

            GalleyView(onOpenSettings: { showingSettings = true })
                .id(orgGeneration)
                .tabItem { Label("Galley", systemImage: "fork.knife") }

            ManifestView(onOpenSettings: { showingSettings = true })
                .id(orgGeneration)
                .tabItem { Label("Manifest", systemImage: "calendar") }

            SupplyView(onOpenSettings: { showingSettings = true })
                .id(orgGeneration)
                .tabItem { Label("Supply", systemImage: "cart") }
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
            if let orgId = env.session.activeOrganizationId {
                env.nextActionDismiss.clear(organizationId: orgId)
            }
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
