import GoogleSignIn
import SwiftUI

@main
struct RationApp: App {
    @State private var env = AppEnvironment()
    /// Prevents Universal Link + custom-scheme callbacks from exchanging the same code twice.
    @State private var handledAuthCode: String?
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
                .environment(env.ask)
                .environment(env.copilotScroll)
                .environment(env.tabDock)
                .preferredColorScheme(env.theme.colorScheme)
                .tint(Theme.hyperGreen)
                .background(Theme.ceramic)
                .task { await env.auth.bootstrap() }
                .task { PerformanceTelemetry.shared.registerIfNeeded() }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL {
                        handleAuthHandoff(url)
                    }
                }
                .onOpenURL { url in
                    if GIDSignIn.sharedInstance.handle(url) {
                        return
                    }
                    if handleAppDeepLink(url) {
                        return
                    }
                    handleAuthHandoff(url)
                }
                .onChange(of: scenePhase) { _, phase in
                    // Share Extension may fail to open the host (host-app policy).
                    // App Group payload is still consumed when the user returns to Ration.
                    guard phase == .active else { return }
                    consumeSharedImportHandoff()
                }
        }
    }

    @MainActor
    private func handleAppDeepLink(_ url: URL) -> Bool {
        if let destination = AppDeepLink.parse(url) {
            if case .galleyImport(let linkURL, let autoStart) = destination {
                let shared = SharedImportHandoff.consumePending()
                // App Group URL is source of truth when present (share handoff).
                let resolvedURL: String?
                if let sharedURL = shared?.url, !sharedURL.isEmpty {
                    resolvedURL = sharedURL
                } else if let linkURL, !linkURL.isEmpty {
                    resolvedURL = linkURL
                } else {
                    resolvedURL = nil
                }
                let resolvedAuto = shared?.autoStart == true || autoStart
                env.openDeepLink(.galleyImport(url: resolvedURL, autoStart: resolvedAuto))
                return true
            }
            env.openDeepLink(destination)
            return true
        }
        return consumeSharedImportHandoff()
    }

    /// Prefer App Group handoff from Share Extension when present.
    @MainActor
    @discardableResult
    private func consumeSharedImportHandoff() -> Bool {
        guard let shared = SharedImportHandoff.consumePending() else { return false }
        env.openDeepLink(.galleyImport(url: shared.url, autoStart: shared.autoStart))
        return true
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
                if AuthHandoffPolicy.isIgnorableHandoffError(error) { return }
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
