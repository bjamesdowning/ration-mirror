import Foundation

/// Sign-in vs create-account mode for the native auth screen.
enum AuthFlowMode: String, CaseIterable, Identifiable {
    case signIn
    case signUp

    var id: String { rawValue }

    var pickerLabel: String {
        switch self {
        case .signIn: "Sign In"
        case .signUp: "Create Account"
        }
    }

    var title: String {
        switch self {
        case .signIn: "Welcome back"
        case .signUp: "Create account"
        }
    }

    var subtitle: String {
        switch self {
        case .signIn: "Sign in to continue"
        case .signUp: "Get started with Ration"
        }
    }

    var magicLinkButtonTitle: String {
        switch self {
        case .signIn: "Send sign-in link"
        case .signUp: "Send sign-up link"
        }
    }

    var requiresTosConsent: Bool { self == .signUp }

    /// Whether auth actions may proceed given ToS checkbox state.
    static func canProceed(tosAccepted: Bool, mode: AuthFlowMode) -> Bool {
        !mode.requiresTosConsent || tosAccepted
    }

    /// Whether the magic-link submit button should be enabled.
    static func canSubmitMagicLink(
        emailValid: Bool,
        tosAccepted: Bool,
        mode: AuthFlowMode
    ) -> Bool {
        emailValid && canProceed(tosAccepted: tosAccepted, mode: mode)
    }
}

/// Client rules for native social auth (Apple / Google).
enum SocialAuthClientPolicy {
    /// One automatic retry on D1 `server_busy` — Create Account only.
    /// Sign In must surface `account_not_found` immediately.
    static func shouldRetryBusyOnce(intent: String) -> Bool {
        intent == "signUp"
    }

    /// Apple sends `fullName` only on the first authorization. Attach it solely
    /// on Create Account so Sign In cannot look like implicit registration.
    static func shouldSendAppleFullName(intent: String) -> Bool {
        intent == "signUp"
    }
}
