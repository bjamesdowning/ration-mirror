import Foundation

/// One Hub capture control. The choice sheet exists only when the flag is on
/// and this binary is an iOS 1.6 client. Flag off and 1.5 keep the scan action.
enum HubCapturePolicy {
    static let iosMinimum = "1.6.0"
    static let addToCargo = "Add to Cargo"
    static let logToFuel = "Log to Fuel"
    static let choiceLabels = [addToCargo, logToFuel]
    static let controlCount = 1

    static func choiceVisible(fastLogEnabled: Bool, appVersion: String) -> Bool {
        fastLogEnabled && isAtLeast(appVersion, iosMinimum)
    }

    static func dailyFuelOpensGoals(fastLogEnabled: Bool, appVersion: String) -> Bool {
        !choiceVisible(fastLogEnabled: fastLogEnabled, appVersion: appVersion)
    }

    static func isAtLeast(_ version: String, _ floor: String) -> Bool {
        let left = version.split(separator: ".").map { Int($0) ?? -1 }
        let right = floor.split(separator: ".").map { Int($0) ?? -1 }
        if left.contains(where: { $0 < 0 }) || right.contains(where: { $0 < 0 }) {
            return false
        }
        let count = max(left.count, right.count)
        for index in 0..<count {
            let lhs = index < left.count ? left[index] : 0
            let rhs = index < right.count ? right[index] : 0
            if lhs != rhs { return lhs > rhs }
        }
        return true
    }
}

enum LogToFuelDraft {
    /// A failed send retries the same key. A new draft mints one.
    static func operationKey(existing: String?, mint: () -> String) -> String {
        if let existing, !existing.isEmpty { return existing }
        return mint()
    }
}

enum AppMarketingVersion {
    static var current: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
    }
}
