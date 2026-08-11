import Foundation

/// App Group handoff for Share Extension → host Import (URL + auto-start intent).
enum SharedImportHandoff {
    static let appGroupId = "group.com.mayutic.ration"
    static let pendingURLKey = "pendingImportURL"
    static let pendingAtKey = "pendingImportURLAt"
    static let pendingAutoStartKey = "pendingImportAutoStart"
    /// Ignore stale share payloads older than 10 minutes.
    private static let maxAgeSeconds: TimeInterval = 600

    struct PendingImport: Equatable, Sendable {
        let url: String
        let autoStart: Bool
    }

    /// Reads and clears a pending share payload. Prefer App Group URL as source of truth.
    static func consumePending() -> PendingImport? {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return nil }
        defer {
            defaults.removeObject(forKey: pendingURLKey)
            defaults.removeObject(forKey: pendingAtKey)
            defaults.removeObject(forKey: pendingAutoStartKey)
        }
        guard let url = defaults.string(forKey: pendingURLKey), !url.isEmpty else {
            return nil
        }
        let at = defaults.double(forKey: pendingAtKey)
        if at > 0, Date().timeIntervalSince1970 - at > maxAgeSeconds {
            return nil
        }
        let autoStart = defaults.object(forKey: pendingAutoStartKey) as? Bool ?? false
        return PendingImport(url: url, autoStart: autoStart)
    }

    /// Test / debug helper — write a payload without going through the Share Extension.
    static func writePendingForTesting(url: String, autoStart: Bool, at: TimeInterval? = nil) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        defaults.set(url, forKey: pendingURLKey)
        defaults.set(at ?? Date().timeIntervalSince1970, forKey: pendingAtKey)
        defaults.set(autoStart, forKey: pendingAutoStartKey)
        defaults.synchronize()
    }

    static func clearForTesting() {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        defaults.removeObject(forKey: pendingURLKey)
        defaults.removeObject(forKey: pendingAtKey)
        defaults.removeObject(forKey: pendingAutoStartKey)
        defaults.synchronize()
    }
}
