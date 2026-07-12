import Foundation

/// Stale-while-revalidate helpers for snapshot-backed ViewModels.
enum SnapshotRefreshPolicy {
    static func isIgnorableRefreshError(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let urlError = error as? URLError, urlError.code == .cancelled { return true }
        return false
    }

    static func userFacingRefreshDetail(_ error: Error) -> String {
        if isIgnorableRefreshError(error) { return "" }
        if let apiError = error as? APIError {
            return apiError.errorDescription ?? "Something went wrong. Try again."
        }
        return "Check your connection and try again."
    }

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
        error: Error
    ) -> String? {
        guard !isIgnorableRefreshError(error) else { return nil }
        let detail = userFacingRefreshDetail(error)
        return "Couldn't refresh \(feature). Showing \(cachedContent). \(detail)"
    }

    static func refreshFailureMessage(
        feature: String,
        cachedContent: String = "cached data",
        detail: String
    ) -> String {
        "Couldn't refresh \(feature). Showing \(cachedContent). \(detail)"
    }

    @MainActor
    static func recordRefreshSuccess(
        outcomes: SnapshotRefreshOutcomeStore,
        organizationId: String,
        domain: String
    ) {
        outcomes.recordSuccess(organizationId: organizationId, domain: domain)
    }

    @MainActor
    static func recordRefreshFailure(
        outcomes: SnapshotRefreshOutcomeStore,
        organizationId: String,
        domain: String,
        error: Error
    ) {
        guard !isIgnorableRefreshError(error) else { return }
        outcomes.recordFailure(organizationId: organizationId, domain: domain)
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
