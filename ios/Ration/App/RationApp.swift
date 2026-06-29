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
                .onOpenURL { url in
                    handleCallback(url)
                }
        }
    }

    /// Handles `ration://auth/callback?code=...` from the magic-link redirect.
    @MainActor
    private func handleCallback(_ url: URL) {
        guard url.scheme == AppConfig.authCallbackScheme,
              url.host == "auth",
              let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                  .queryItems?.first(where: { $0.name == "code" })?.value
        else { return }

        Task {
            do {
                try await env.auth.exchangeCode(code)
            } catch {
                env.auth.recordAuthError(error)
            }
        }
    }
}
