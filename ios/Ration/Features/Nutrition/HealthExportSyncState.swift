import Foundation

/// Per-person export bookkeeping on this iPhone. Timestamps and counts only:
/// no food names, nutrients, or Health data. Cleared on sign-out, on turning
/// export off, and on account deletion.
struct HealthExportSyncState {
    /// Raise to force one full repair sync after an upgrade (1.6.39 fixes the
    /// sample time and re-saves anything written at the wrong time).
    static let currentSchemaVersion = 2
    static let keyPrefix = "ration.health."

    let defaults: UserDefaults
    let userId: String

    init(defaults: UserDefaults = .standard, userId: String) {
        self.defaults = defaults
        self.userId = userId
    }

    private func key(_ name: String) -> String {
        "\(Self.keyPrefix)\(userId).\(name)"
    }

    /// Server time the last complete sync covered, sent back as `since`.
    var syncedThrough: String? {
        get { defaults.string(forKey: key("syncedThrough")) }
        nonmutating set { defaults.set(newValue, forKey: key("syncedThrough")) }
    }

    var lastSyncedAt: Date? {
        get { defaults.object(forKey: key("lastSyncedAt")) as? Date }
        nonmutating set { defaults.set(newValue, forKey: key("lastSyncedAt")) }
    }

    var schemaVersion: Int {
        get { defaults.integer(forKey: key("schemaVersion")) }
        nonmutating set { defaults.set(newValue, forKey: key("schemaVersion")) }
    }

    /// Last enabled value the server returned. Passive triggers skip the
    /// network when it is false.
    var lastEnabled: Bool {
        get { defaults.bool(forKey: key("enabled")) }
        nonmutating set { defaults.set(newValue, forKey: key("enabled")) }
    }

    /// Foods kept out of Health on the last full sync.
    var lastExcluded: Int {
        get { defaults.integer(forKey: key("excluded")) }
        nonmutating set { defaults.set(newValue, forKey: key("excluded")) }
    }

    var needsRepair: Bool { schemaVersion < Self.currentSchemaVersion }

    func clear() {
        for name in ["syncedThrough", "lastSyncedAt", "schemaVersion", "enabled", "excluded"] {
            defaults.removeObject(forKey: key(name))
        }
    }

    /// Sign-out wipes every person's state on this iPhone.
    static func clearAll(defaults: UserDefaults = .standard) {
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(keyPrefix) {
            defaults.removeObject(forKey: key)
        }
        // Leftover key written by pre-1.6.39 account deletion; nothing reads it.
        defaults.removeObject(forKey: "ration.fuel.healthSyncIdentifiers")
    }
}
