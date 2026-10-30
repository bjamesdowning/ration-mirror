import Foundation

/// File-backed read snapshots with per-domain sync metadata, scoped by organization
/// (shared hub/cargo/galley) or user+organization (private Manifest / nutrition).
/// Disk I/O and JSON work run on `SnapshotDiskWorker`; sync metadata is cached on the main actor.
@MainActor
final class SnapshotStore {
    typealias Metadata = SnapshotDiskWorker.Metadata

    private let disk = SnapshotDiskWorker()
    private var syncedAtByKey: [String: Date] = [:]
    private var writeGeneration = 0
    private var didClearLegacyManifest = false

    func save<T: Codable & Sendable>(
        _ payload: T,
        domain: String,
        scope: SnapshotScope
    ) async {
        let generation = writeGeneration
        do {
            let didSave = try await disk.save(
                payload,
                domain: domain,
                scope: scope,
                expectedGeneration: generation
            )
            guard didSave, generation == writeGeneration else { return }
            recordSyncedAt(Date(), domain: domain, scope: scope)
        } catch {
            // Best-effort cache — failures should not block UI.
        }
    }

    func save<T: Codable & Sendable>(
        _ payload: T,
        domain: String,
        organizationId: String
    ) async {
        await save(payload, domain: domain, scope: .organization(organizationId))
    }

    func load<T: Codable & Sendable>(
        _ type: T.Type,
        domain: String,
        scope: SnapshotScope
    ) async -> (payload: T, metadata: Metadata)? {
        if scope.isPrivate, domain == SnapshotDomain.manifest {
            await ensureLegacyManifestCleared()
        }
        do {
            guard let result = try await disk.load(type, domain: domain, scope: scope) else {
                return nil
            }
            recordSyncedAt(result.metadata.syncedAt, domain: domain, scope: scope)
            return result
        } catch {
            return nil
        }
    }

    func load<T: Codable & Sendable>(
        _ type: T.Type,
        domain: String,
        organizationId: String
    ) async -> (payload: T, metadata: Metadata)? {
        await load(type, domain: domain, scope: .organization(organizationId))
    }

    func syncedAt(domain: String, scope: SnapshotScope) -> Date? {
        syncedAtByKey[cacheKey(domain: domain, scope: scope)]
    }

    func syncedAt(domain: String, organizationId: String) -> Date? {
        syncedAt(domain: domain, scope: .organization(organizationId))
    }

    func lastSyncedLabel(domain: String, scope: SnapshotScope) -> String? {
        guard let syncedAt = syncedAt(domain: domain, scope: scope) else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return "Last synced \(formatter.localizedString(for: syncedAt, relativeTo: Date()))"
    }

    func lastSyncedLabel(domain: String, organizationId: String) -> String? {
        lastSyncedLabel(domain: domain, scope: .organization(organizationId))
    }

    func warmSyncMetadata(domain: String, scope: SnapshotScope) async {
        let key = cacheKey(domain: domain, scope: scope)
        guard syncedAtByKey[key] == nil else { return }
        do {
            if let metadata = try await disk.loadMetadata(domain: domain, scope: scope) {
                recordSyncedAt(metadata.syncedAt, domain: domain, scope: scope)
            }
        } catch {
            // Non-fatal — toolbar may show never-synced until next load.
        }
    }

    func warmSyncMetadata(domain: String, organizationId: String) async {
        await warmSyncMetadata(domain: domain, scope: .organization(organizationId))
    }

    func clearAll() async {
        writeGeneration += 1
        syncedAtByKey = [:]
        didClearLegacyManifest = false
        try? await disk.clearAll()
    }

    func clear(organizationId: String) async {
        writeGeneration += 1
        syncedAtByKey = syncedAtByKey.filter { !$0.key.hasPrefix("\(organizationId)|") }
        try? await disk.clear(organizationId: organizationId)
    }

    func clear(scope: SnapshotScope) async {
        writeGeneration += 1
        let prefix = cacheKeyPrefix(scope: scope)
        syncedAtByKey = syncedAtByKey.filter { !$0.key.hasPrefix(prefix) }
        try? await disk.clear(scope: scope)
    }

    func clear(domain: String, scope: SnapshotScope) async {
        writeGeneration += 1
        syncedAtByKey.removeValue(forKey: cacheKey(domain: domain, scope: scope))
        try? await disk.clear(domain: domain, scope: scope)
    }

    func clear(domain: String, organizationId: String) async {
        await clear(domain: domain, scope: .organization(organizationId))
    }

    /// Removes org-only Manifest caches so private Manifest never reads another member's intake.
    func clearLegacyManifestSnapshots() async {
        writeGeneration += 1
        let legacyKeys = syncedAtByKey.keys.filter { key in
            key.hasSuffix("|\(SnapshotDomain.manifest)") && !key.contains("|u_")
        }
        for key in legacyKeys {
            syncedAtByKey.removeValue(forKey: key)
        }
        try? await disk.clearLegacyManifestSnapshots()
        didClearLegacyManifest = true
    }

    private func ensureLegacyManifestCleared() async {
        guard !didClearLegacyManifest else { return }
        await clearLegacyManifestSnapshots()
    }

    private func cacheKey(domain: String, scope: SnapshotScope) -> String {
        switch scope {
        case let .organization(organizationId):
            return "\(organizationId)|\(domain)"
        case let .userOrganization(_, organizationId):
            let fingerprint = scope.privateFingerprint ?? "unknown"
            return "\(organizationId)|u_\(fingerprint)|\(domain)"
        }
    }

    private func cacheKeyPrefix(scope: SnapshotScope) -> String {
        switch scope {
        case let .organization(organizationId):
            return "\(organizationId)|"
        case let .userOrganization(_, organizationId):
            let fingerprint = scope.privateFingerprint ?? "unknown"
            return "\(organizationId)|u_\(fingerprint)|"
        }
    }

    private func recordSyncedAt(_ date: Date, domain: String, scope: SnapshotScope) {
        syncedAtByKey[cacheKey(domain: domain, scope: scope)] = date
    }
}

enum SnapshotDomain {
    static let hub = "hub"
    static let cargo = "cargo"
    static let galley = "galley"
    static let manifest = "manifest"
    static let supply = "supply"
    static let ask = "ask"
    static let nutritionSummary = "nutrition-summary"
    static let nutritionConsent = "nutrition-consent"
}
