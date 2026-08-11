import Foundation

/// App Group handoff for Share Extension → host Import prefill.
enum SharedImportHandoff {
    static let appGroupId = "group.com.mayutic.ration"
    static let pendingURLKey = "pendingImportURL"
    static let pendingAtKey = "pendingImportURLAt"
    /// Ignore stale share payloads older than 10 minutes.
    private static let maxAgeSeconds: TimeInterval = 600

    static func consumePendingURL() -> String? {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return nil }
        defer {
            defaults.removeObject(forKey: pendingURLKey)
            defaults.removeObject(forKey: pendingAtKey)
        }
        guard let url = defaults.string(forKey: pendingURLKey), !url.isEmpty else {
            return nil
        }
        let at = defaults.double(forKey: pendingAtKey)
        if at > 0, Date().timeIntervalSince1970 - at > maxAgeSeconds {
            return nil
        }
        return url
    }
}
