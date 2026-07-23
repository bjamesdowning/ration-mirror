import Foundation

/// Client mirror of `app/lib/tiers.ts` — UX meters and copy only.
/// Server `checkCapacity` remains the enforcement source of truth.
enum TierLimits {
    /// Unlimited sentinel (matches server `-1`).
    static let unlimited = -1

    static let freeMaxInventoryItems = 35
    static let freeMaxMeals = 15
    static let freeMaxGroceryLists = 3
    static let freeMaxOwnedGroups = 1

    static let crewMaxOwnedGroups = 5

    /// Soft warning threshold matching web `CapacityIndicator` (≥80%).
    static let softWarningPercent = 80

    static func maxInventoryItems(isCrewMember: Bool) -> Int {
        isCrewMember ? unlimited : freeMaxInventoryItems
    }

    static func maxMeals(isCrewMember: Bool) -> Int {
        isCrewMember ? unlimited : freeMaxMeals
    }

    static func maxOwnedGroups(isCrewMember: Bool) -> Int {
        isCrewMember ? crewMaxOwnedGroups : freeMaxOwnedGroups
    }

    static func usagePercent(current: Int, limit: Int) -> Int? {
        guard limit > 0, limit != unlimited else { return nil }
        return min(100, Int((Double(current) / Double(limit) * 100).rounded()))
    }

    static func isSoftWarning(current: Int, limit: Int) -> Bool {
        guard let pct = usagePercent(current: current, limit: limit) else { return false }
        return pct >= softWarningPercent && pct < 100
    }

    static func isAtLimit(current: Int, limit: Int) -> Bool {
        guard let pct = usagePercent(current: current, limit: limit) else { return false }
        return pct >= 100
    }
}
