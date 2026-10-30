import Foundation

/// App Store / TestFlight review login reveal gate (not a secret — password is server-side).
enum AppReviewLoginGate {
    static let reviewEmail = "app-review@mayutic.com"

    /// The server still rejects review logins unless Flagship `app-review-login` is on.
    static func shouldShowPassword(email: String) -> Bool {
        let normalized = email
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return normalized == reviewEmail
    }
}
