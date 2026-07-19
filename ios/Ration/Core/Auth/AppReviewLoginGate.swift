import Foundation

/// App Store / TestFlight review login reveal gate (not a secret — password is server-side).
enum AppReviewLoginGate {
    static let reviewEmail = "app-review@mayutic.com"

    /// Password field is shown only when Flagship `appReviewLogin` is on and the email matches.
    static func shouldShowPassword(flagEnabled: Bool, email: String) -> Bool {
        guard flagEnabled else { return false }
        let normalized = email
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return normalized == reviewEmail
    }
}
