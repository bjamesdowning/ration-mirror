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

    /// Site origin for resolving relative avatar paths (`/api/user/avatar/...`).
    static var webOrigin: URL {
        if let override = ProcessInfo.processInfo.environment["RATION_WEB_ORIGIN"],
           let url = URL(string: override) {
            return url
        }
        var origin = apiBaseURL
        if origin.path.hasSuffix("/api/mobile/v1") {
            origin.deleteLastPathComponent()
            origin.deleteLastPathComponent()
            origin.deleteLastPathComponent()
        }
        return origin
    }

    static var copilotBaseURL: URL {
        if let override = ProcessInfo.processInfo.environment["RATION_COPILOT_BASE"],
           let url = URL(string: override) {
            return url
        }
        return URL(string: "wss://copilot.ration.mayutic.com/copilot")!
    }

    /// Allow `http://localhost` avatar URLs when the web origin is local dev.
    static var allowsInsecureLocalhost: Bool {
        guard let host = webOrigin.host?.lowercased() else { return false }
        return host == "localhost" || host == "127.0.0.1"
    }

    /// Custom URL scheme registered in Info.plist for the auth callback fallback.
    static let authCallbackScheme = "ration"
    static let authCallbackHost = "ration.mayutic.com"

    static let supportEmail = "support@mayutic.com"
    static let gitlabIssuesURL = URL(string: "https://gitlab.com/mayutic/ration/application/-/issues")!
    static let webOriginURL = URL(string: "https://ration.mayutic.com")!
    /// Product how-to guide (`docs/fin` → `/help`). Same corpus Ask Ration searches.
    static let userGuideURL = URL(string: "https://ration.mayutic.com/help")!
    /// Developer MCP connected-agents panel on web Settings.
    static let helpDocsURL = URL(string: "https://ration.mayutic.com/hub/settings#connected-agents")!
    static let blogURL = URL(string: "https://ration.mayutic.com/blog")!
    static let termsURL = URL(string: "https://ration.mayutic.com/legal/terms")!
    static let privacyURL = URL(string: "https://ration.mayutic.com/legal/privacy")!

    /// RevenueCat consumable product id prefix (`credits_s`, `credits_m`, …).
    static let creditPackProductPrefix = "credits_"

    /// Google OAuth iOS client ID — public value from GCP. Override via scheme env
    /// `GOOGLE_IOS_CLIENT_ID` or `GIDClientID` in Info.plist.
    static var googleIOSClientID: String? {
        if let override = ProcessInfo.processInfo.environment["GOOGLE_IOS_CLIENT_ID"],
           !override.isEmpty {
            return override
        }
        if let plist = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
           !plist.isEmpty,
           !plist.hasPrefix("$(") {
            return plist
        }
        return nil
    }

    /// Reversed Google iOS client ID for `CFBundleURLSchemes` (derived from `GIDClientID`).
    static var googleIOSURLScheme: String? {
        guard let clientID = googleIOSClientID else { return nil }
        let suffix = ".apps.googleusercontent.com"
        guard clientID.hasSuffix(suffix) else { return nil }
        let idPart = String(clientID.dropLast(suffix.count))
        return "com.googleusercontent.apps.\(idPart)"
    }
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
