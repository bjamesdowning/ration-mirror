import Foundation

/// App Group handoff for Share Extension → host Import (URL + auto-start intent).
enum SharedImportHandoff {
    static let appGroupId = "group.com.mayutic.ration"
    static let pendingURLKey = "pendingImportURL"
    static let pendingAtKey = "pendingImportURLAt"
    static let pendingAutoStartKey = "pendingImportAutoStart"
    static let pendingUserTextKey = "pendingImportUserText"
    /// Ignore stale share payloads older than 10 minutes.
    private static let maxAgeSeconds: TimeInterval = 600

    struct PendingImport: Equatable, Sendable {
        let url: String
        let autoStart: Bool
        let userText: String?
    }

    /// Reads and clears a pending share payload. Prefer App Group URL as source of truth.
    static func consumePending() -> PendingImport? {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return nil }
        defer { clear() }
        guard let url = defaults.string(forKey: pendingURLKey), !url.isEmpty else {
            return nil
        }
        let at = defaults.double(forKey: pendingAtKey)
        if at > 0, Date().timeIntervalSince1970 - at > maxAgeSeconds {
            return nil
        }
        let autoStart = defaults.object(forKey: pendingAutoStartKey) as? Bool ?? false
        let userText = defaults.string(forKey: pendingUserTextKey)
        return PendingImport(url: url, autoStart: autoStart, userText: userText)
    }

    /// Clears any pending share handoff (call on logout so the next account cannot inherit it).
    static func clear() {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        defaults.removeObject(forKey: pendingURLKey)
        defaults.removeObject(forKey: pendingAtKey)
        defaults.removeObject(forKey: pendingAutoStartKey)
        defaults.removeObject(forKey: pendingUserTextKey)
        defaults.synchronize()
    }

    /// Test / debug helper — write a payload without going through the Share Extension.
    static func writePendingForTesting(
        url: String,
        autoStart: Bool,
        userText: String? = nil,
        at: TimeInterval? = nil
    ) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        defaults.set(url, forKey: pendingURLKey)
        defaults.set(at ?? Date().timeIntervalSince1970, forKey: pendingAtKey)
        defaults.set(autoStart, forKey: pendingAutoStartKey)
        if let userText, !userText.isEmpty {
            defaults.set(userText, forKey: pendingUserTextKey)
        } else {
            defaults.removeObject(forKey: pendingUserTextKey)
        }
        defaults.synchronize()
    }

    static func clearForTesting() {
        clear()
    }
}
