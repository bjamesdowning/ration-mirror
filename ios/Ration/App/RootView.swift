import SwiftUI

/// Auth gate — routes between the launch splash, sign-in, and the main tab shell.
struct RootView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        switch env.auth.phase {
        case .loading:
            LoadingView(label: "Calibrating…")
        case .signedOut:
            SignInView()
        case .signedIn:
            MainTabView()
        }
    }
}

/// Bottom tab navigation — Dashboard, Cargo, Scan, Supply, Settings.
struct MainTabView: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Hub", systemImage: "square.grid.2x2") }

            CargoListView()
                .tabItem { Label("Cargo", systemImage: "shippingbox") }

            ScanView()
                .tabItem { Label("Scan", systemImage: "camera.viewfinder") }

            SupplyView()
                .tabItem { Label("Supply", systemImage: "cart") }

            GalleyView()
                .tabItem { Label("Galley", systemImage: "fork.knife") }

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}
