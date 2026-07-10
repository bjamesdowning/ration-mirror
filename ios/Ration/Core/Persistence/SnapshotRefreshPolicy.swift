import Foundation

/// Stale-while-revalidate helpers for snapshot-backed ViewModels.
enum SnapshotRefreshPolicy {
    static func hasUsableContent(
        hasSnapshot: Bool,
        modeSpecificItemCount: Int? = nil
    ) -> Bool {
        if let modeSpecificItemCount {
            return modeSpecificItemCount > 0
        }
        return hasSnapshot
    }

    static func refreshFailureMessage(
        feature: String,
        cachedContent: String = "cached data",
        detail: String
    ) -> String {
        "Couldn't refresh \(feature). Showing \(cachedContent). \(detail)"
    }

    /// Applies cached payload when present. Returns whether cache was shown.
    @MainActor
    static func restoreIfAvailable<T: Codable & Sendable>(
        snapshots: SnapshotStore,
        type: T.Type,
        domain: String,
        organizationId: String,
        apply: (T) -> Void
    ) async -> Bool {
        guard let cached = await snapshots.load(type, domain: domain, organizationId: organizationId) else {
            return false
        }
        apply(cached.payload)
        return true
    }
}
