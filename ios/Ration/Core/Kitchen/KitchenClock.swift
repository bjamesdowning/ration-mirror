import Foundation

/// Kitchen calendar day for Manifest and Supply.
/// A missing zone keeps the device clock so existing days do not jump to UTC.
enum KitchenClock {
    private static let lock = NSLock()
    private static var identifier: String?

    static func set(identifier: String?) {
        lock.lock()
        self.identifier = identifier
        lock.unlock()
    }

    static var currentIdentifier: String? {
        lock.lock()
        defer { lock.unlock() }
        return identifier
    }

    /// IANA names only. Foundation accepts abbreviations such as PST, which would shift the day.
    static func accepts(_ identifier: String) -> Bool {
        guard identifier.count <= 64 else { return false }
        guard identifier == "UTC" || identifier == "Etc/UTC" || identifier.contains("/") else {
            return false
        }
        return TimeZone(identifier: identifier) != nil
    }

    /// Kitchen-local today when a valid zone is stored. Nil keeps the caller on the device clock.
    static func zonedTodayISO(now: Date = Date()) -> String? {
        guard let identifier = currentIdentifier, accepts(identifier),
              let timeZone = TimeZone(identifier: identifier) else {
            return nil
        }
        return isoDate(now, timeZone: timeZone)
    }

    static func isoDate(_ date: Date, timeZone: TimeZone) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let year = calendar.component(.year, from: date)
        let month = calendar.component(.month, from: date)
        let day = calendar.component(.day, from: date)
        return String(format: "%04d-%02d-%02d", year, month, day)
    }
}

enum KitchenTimeZoneSync {
    /// Stored zone wins. Capture is allowed only when none is stored.
    static func resolvedIdentifier(stored: String?, device: String, canCapture: Bool) -> String? {
        if let stored, KitchenClock.accepts(stored) {
            return stored
        }
        guard canCapture, KitchenClock.accepts(device) else { return nil }
        return device
    }

    @MainActor
    static func sync(api: RationAPI, canCapture: Bool) async {
        KitchenClock.set(identifier: nil)
        do {
            let response = try await api.organizationSupplySettings()
            if let stored = response.supplySettings.timeZone, KitchenClock.accepts(stored) {
                KitchenClock.set(identifier: stored)
                return
            }
            guard canCapture else { return }
            let device = TimeZone.current.identifier
            guard KitchenClock.accepts(device) else { return }
            let patched = try await api.captureOrganizationTimeZone(device)
            let stored = patched.supplySettings.timeZone
            if let stored, KitchenClock.accepts(stored) {
                KitchenClock.set(identifier: stored)
            } else {
                KitchenClock.set(identifier: device)
            }
        } catch {
            KitchenClock.set(identifier: nil)
        }
    }
}
