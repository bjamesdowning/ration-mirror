import Foundation
import Observation

/// Tracks per-domain refresh failures so stale disclosure appears only after a real failed attempt.
@MainActor
@Observable
final class SnapshotRefreshOutcomeStore {
    private var failedKeys: Set<String> = []

    func recordSuccess(organizationId: String, domain: String) {
        failedKeys.remove(Self.key(organizationId: organizationId, domain: domain))
    }

    func recordFailure(organizationId: String, domain: String) {
        failedKeys.insert(Self.key(organizationId: organizationId, domain: domain))
    }

    func lastRefreshFailed(organizationId: String, domain: String) -> Bool {
        failedKeys.contains(Self.key(organizationId: organizationId, domain: domain))
    }

    func clearAll() {
        failedKeys.removeAll()
    }

    static func key(organizationId: String, domain: String) -> String {
        "\(organizationId)|\(domain)"
    }
}
