import Foundation

/// One Hub action control. Log to Fuel still requires the fast-log flag
/// and an iOS 1.6 client. Other rows use the flag that already gates them.
enum HubCapturePolicy {
    static let iosMinimum = "1.6.0"
    static let logToFuel = "Log to Fuel"
    static let scanToCargo = "Scan to Cargo"
    static let generateMeal = "Generate Meal"
    static let planWeek = "Plan Week"
    static let dockFromReceipt = "Dock from Receipt"
    static let choiceLabels = [
        logToFuel, scanToCargo, generateMeal, planWeek, dockFromReceipt,
    ]
    static let controlCount = 1

    struct Visibility: Equatable {
        var logToFuel: Bool
        var scanToCargo: Bool
        var generateMeal: Bool
        var planWeek: Bool
        var dockFromReceipt: Bool

        init(
            logToFuel: Bool = false,
            scanToCargo: Bool = false,
            generateMeal: Bool = false,
            planWeek: Bool = false,
            dockFromReceipt: Bool = false
        ) {
            self.logToFuel = logToFuel
            self.scanToCargo = scanToCargo
            self.generateMeal = generateMeal
            self.planWeek = planWeek
            self.dockFromReceipt = dockFromReceipt
        }
    }

    /// Menu order with flagged-off rows removed. Relative order of the rest stays.
    static func visibleLabels(_ visibility: Visibility) -> [String] {
        var labels: [String] = []
        if visibility.logToFuel { labels.append(logToFuel) }
        if visibility.scanToCargo { labels.append(scanToCargo) }
        if visibility.generateMeal { labels.append(generateMeal) }
        if visibility.planWeek { labels.append(planWeek) }
        if visibility.dockFromReceipt { labels.append(dockFromReceipt) }
        return labels
    }

    static func menuActive(_ visibility: Visibility) -> Bool {
        !visibleLabels(visibility).isEmpty
    }

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

/// Star, custom macros, and log-by-id. Hidden unless the parent capture
/// control is visible and the saved-food flag is on. A 1.5 binary stays closed.
enum SavedFoodPolicy {
    static func controlVisible(
        fastLogEnabled: Bool,
        savedFoodEnabled: Bool,
        appVersion: String
    ) -> Bool {
        savedFoodEnabled
            && HubCapturePolicy.choiceVisible(
                fastLogEnabled: fastLogEnabled,
                appVersion: appVersion
            )
    }
}

/// Shutter and barcode stay disabled unless the parent capture control and
/// the matching child flag are on. A 1.5 binary stays closed.
enum FuelLogInputPolicy {
    static func shutterEnabled(
        fastLogEnabled: Bool,
        photoLogEnabled: Bool,
        appVersion: String
    ) -> Bool {
        photoLogEnabled
            && HubCapturePolicy.choiceVisible(
                fastLogEnabled: fastLogEnabled,
                appVersion: appVersion
            )
    }

    static func barcodeEnabled(
        fastLogEnabled: Bool,
        barcodeLogEnabled: Bool,
        appVersion: String
    ) -> Bool {
        barcodeLogEnabled
            && HubCapturePolicy.choiceVisible(
                fastLogEnabled: fastLogEnabled,
                appVersion: appVersion
            )
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
