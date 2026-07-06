import SwiftUI

@main
struct RationApp: App {
    @State private var env = AppEnvironment()
    /// Prevents Universal Link + custom-scheme callbacks from exchanging the same code twice.
    @State private var handledAuthCode: String?

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
                .preferredColorScheme(env.theme.colorScheme)
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
        guard env.auth.phase != .signedIn else { return }
        guard let code = Self.authCode(from: url) else { return }
        guard handledAuthCode != code else { return }
        handledAuthCode = code
        Task {
            do {
                try await env.auth.exchangeCode(code)
            } catch {
                handledAuthCode = nil
                env.auth.recordAuthError(error)
            }
        }
    }

    /// Parses auth `code` from Universal Link or custom-scheme callback URLs.
    static func authCode(from url: URL) -> String? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return nil }

        var isUniversalLink =
            components.scheme == "https"
            && components.host == AppConfig.authCallbackHost
            && components.path == "/auth/mobile-callback/open"
        #if DEBUG
        isUniversalLink = isUniversalLink
            || (components.scheme == "http"
                && components.host == AppConfig.authCallbackHost
                && components.path == "/auth/mobile-callback/open")
        #endif
        let isCustomScheme =
            components.scheme == AppConfig.authCallbackScheme && components.host == "auth"

        guard isUniversalLink || isCustomScheme else { return nil }
        return components.queryItems?
            .first(where: { $0.name == "code" })?
            .value
    }
}
