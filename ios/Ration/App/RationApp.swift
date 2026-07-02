import SwiftUI

@main
struct RationApp: App {
    @State private var env = AppEnvironment()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
                .tint(Theme.hyperGreen)
                .background(Theme.ceramic)
                .task { await env.auth.bootstrap() }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL {
                        handleAuthHandoff(url)
                    }
                }
                .onOpenURL { url in
                    handleAuthHandoff(url)
                }
        }
    }

    @MainActor
    private func handleAuthHandoff(_ url: URL) {
        guard let code = Self.authCode(from: url) else { return }
        Task {
            do {
                try await env.auth.exchangeCode(code)
            } catch {
                env.auth.recordAuthError(error)
            }
        }
    }

    /// Parses auth `code` from Universal Link or custom-scheme callback URLs.
    static func authCode(from url: URL) -> String? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return nil }

        let isUniversalLink =
            (components.scheme == "https" || components.scheme == "http")
            && components.host == AppConfig.authCallbackHost
            && components.path == "/auth/mobile-callback/open"
        let isCustomScheme =
            components.scheme == AppConfig.authCallbackScheme && components.host == "auth"

        guard isUniversalLink || isCustomScheme else { return nil }
        return components.queryItems?
            .first(where: { $0.name == "code" })?
            .value
    }
}
