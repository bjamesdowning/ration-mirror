import SwiftUI

@main
struct RationApp: App {
    @State private var env = AppEnvironment()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
                .tint(Theme.hyperGreen)
                .task { await env.auth.bootstrap() }
                // Universal Link (preferred): https://ration.mayutic.com/auth/mobile-callback/open?code=…
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL {
                        handleAuthHandoff(url)
                    }
                }
                // Custom-scheme fallback: ration://auth/callback?code=…
                .onOpenURL { url in
                    handleAuthHandoff(url)
                }
        }
    }

    /// Extracts the one-time auth code from either the Universal Link or the
    /// custom-scheme fallback and exchanges it for a token pair.
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

    /// Parses the auth `code` from a supported handoff URL.
    /// - Universal Link: `https://<host>/auth/mobile-callback/open?code=…`
    /// - Custom scheme: `ration://auth/callback?code=…`
    static func authCode(from url: URL) -> String? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return nil }

        let isUniversalLink =
            (components.scheme == "https" || components.scheme == "http")
            && components.path == "/auth/mobile-callback/open"
        let isCustomScheme =
            components.scheme == AppConfig.authCallbackScheme && components.host == "auth"

        guard isUniversalLink || isCustomScheme else { return nil }
        return components.queryItems?
            .first(where: { $0.name == "code" })?
            .value
    }
}
