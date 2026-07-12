import Foundation

/// Magic-link deep-link handoff errors — cancellation filtering and user-facing copy.
enum AuthHandoffPolicy {
    static func isIgnorableHandoffError(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let urlError = error as? URLError, urlError.code == .cancelled { return true }
        if let apiError = error as? APIError, apiError.code == "cancelled" { return true }
        return false
    }

    static func userFacingMessage(for error: Error) -> String {
        if isIgnorableHandoffError(error) { return "" }

        if let apiError = error as? APIError {
            switch apiError.code {
            case "missing_pkce_verifier":
                return "Sign-in session lost. Request a new magic link from the app, then open the email link without reinstalling the app."
            case "invalid_code":
                return "This sign-in link expired or was already used. Go back to your email and tap the link again, or request a new one."
            case "invalid_grant":
                return "We couldn't verify this device. Request a new magic link from the app, then open the email link on the same device."
            default:
                break
            }
            if let description = apiError.errorDescription, !description.isEmpty {
                return description
            }
        }

        return "We couldn't finish signing in. Go back to your email and tap the link again, or request a new one."
    }
}
