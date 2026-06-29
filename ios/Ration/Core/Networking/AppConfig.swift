import Foundation

enum AppConfig {
    /// Production mobile API base. Override with a `RATION_API_BASE` env var in a
    /// scheme for local/staging testing against `http://localhost:5173`.
    static var apiBaseURL: URL {
        if let override = ProcessInfo.processInfo.environment["RATION_API_BASE"],
           let url = URL(string: override) {
            return url
        }
        return URL(string: "https://ration.mayutic.com/api/mobile/v1")!
    }

    /// Custom URL scheme registered in Info.plist for the auth callback.
    static let authCallbackScheme = "ration"

    /// RevenueCat entitlement identifier shared with the server (`billing.constants.ts`).
    static let crewEntitlement = "crew_member"

    static let supportEmail = "support@mayutic.com"
    static let gitlabIssuesURL = URL(string: "https://gitlab.com/mayutic/ration/application/-/issues")!
    static let termsURL = URL(string: "https://ration.mayutic.com/legal/terms")!
    static let privacyURL = URL(string: "https://ration.mayutic.com/legal/privacy")!

    /// RevenueCat consumable product id prefix (`credits_s`, `credits_m`, …).
    static let creditPackProductPrefix = "credits_"
}

/// Shared JSON coders with lenient ISO-8601 date handling.
/// The Worker serializes JS `Date` as ISO-8601 with fractional seconds
/// (`2026-01-01T00:00:00.000Z`); Foundation's `.iso8601` rejects fractions,
/// so we try both representations.
enum JSON {
    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]

        d.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = withFraction.date(from: raw) ?? plain.date(from: raw) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO-8601 date: \(raw)"
            )
        }
        return d
    }()

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}
