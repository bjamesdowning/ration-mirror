import Foundation

/// Resolves avatar/logo URLs from session data — relative `/api/*` paths or allowlisted OAuth hosts.
enum AvatarURLResolver {
    private static let allowedOAuthHosts: Set<String> = [
        "lh3.googleusercontent.com",
        "lh4.googleusercontent.com",
        "lh5.googleusercontent.com",
        "lh6.googleusercontent.com",
        "avatars.githubusercontent.com",
        "platform-lookaside.fbsbx.com",
    ]

    /// Returns a safe absolute URL for display, or nil for untrusted input.
    static func resolve(_ raw: String?) -> URL? {
        guard let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty
        else { return nil }

        if trimmed.hasPrefix("/") {
            guard trimmed.hasPrefix("/api/") else { return nil }
            return URL(string: trimmed, relativeTo: AppConfig.webOrigin)?.absoluteURL
        }

        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased()
        else { return nil }

        switch scheme {
        case "https":
            guard let host = url.host?.lowercased(), isAllowedHost(host) else { return nil }
            return url
        case "http":
            guard AppConfig.allowsInsecureLocalhost, isLocalhost(url) else { return nil }
            return url
        default:
            return nil
        }
    }

    /// Org logo paths require Bearer auth on GET.
    static func requiresAuthentication(_ url: URL) -> Bool {
        url.path.hasPrefix("/api/organization/avatar/")
    }

    private static func isAllowedHost(_ host: String) -> Bool {
        if allowedOAuthHosts.contains(host) { return true }
        return host.hasSuffix(".googleusercontent.com")
    }

    private static func isLocalhost(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == "localhost" || host == "127.0.0.1"
    }
}
