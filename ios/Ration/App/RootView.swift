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
                .task { await evaluateOnboarding() }
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
            // If settings cannot load, still allow the app — onboarding can be retried from Settings.
            showOnboarding = false
        }
    }
}

/// Bottom tab navigation — Hub, Cargo, Galley, Manifest, Supply.
struct MainTabView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var showingSettings = false
    @State private var showingScan = false

    var body: some View {
        TabView {
            DashboardView(onScan: { showingScan = true }, onOpenSettings: { showingSettings = true })
                .tabItem { Label("Hub", systemImage: "square.grid.2x2") }

            CargoListView(onScan: { showingScan = true }, onOpenSettings: { showingSettings = true })
                .tabItem { Label("Cargo", systemImage: "shippingbox") }

            GalleyView(onOpenSettings: { showingSettings = true })
                .tabItem { Label("Galley", systemImage: "fork.knife") }

            ManifestView(onOpenSettings: { showingSettings = true })
                .tabItem { Label("Manifest", systemImage: "calendar") }

            SupplyView(onOpenSettings: { showingSettings = true })
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
