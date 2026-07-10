import Foundation

/// File-backed read snapshots with per-domain sync metadata, scoped by organization.
/// Disk I/O and JSON work run on `SnapshotDiskWorker`; sync metadata is cached on the main actor.
@MainActor
final class SnapshotStore {
    typealias Metadata = SnapshotDiskWorker.Metadata

    private let disk = SnapshotDiskWorker()
    private var syncedAtByKey: [String: Date] = [:]
    private var writeGeneration = 0

    func save<T: Codable & Sendable>(
        _ payload: T,
        domain: String,
        organizationId: String
    ) async {
        let generation = writeGeneration
        do {
            let didSave = try await disk.save(
                payload,
                domain: domain,
                organizationId: organizationId,
                expectedGeneration: generation
            )
            guard didSave, generation == writeGeneration else { return }
            recordSyncedAt(Date(), domain: domain, organizationId: organizationId)
        } catch {
            // Best-effort cache — failures should not block UI.
        }
    }

    func load<T: Codable & Sendable>(
        _ type: T.Type,
        domain: String,
        organizationId: String
    ) async -> (payload: T, metadata: Metadata)? {
        do {
            guard let result = try await disk.load(type, domain: domain, organizationId: organizationId) else {
                return nil
            }
            recordSyncedAt(result.metadata.syncedAt, domain: domain, organizationId: organizationId)
            return result
        } catch {
            return nil
        }
    }

    func syncedAt(domain: String, organizationId: String) -> Date? {
        syncedAtByKey[cacheKey(domain: domain, organizationId: organizationId)]
    }

    func lastSyncedLabel(domain: String, organizationId: String) -> String? {
        guard let syncedAt = syncedAt(domain: domain, organizationId: organizationId) else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return "Last synced \(formatter.localizedString(for: syncedAt, relativeTo: Date()))"
    }

    func warmSyncMetadata(domain: String, organizationId: String) async {
        let key = cacheKey(domain: domain, organizationId: organizationId)
        guard syncedAtByKey[key] == nil else { return }
        do {
            if let metadata = try await disk.loadMetadata(domain: domain, organizationId: organizationId) {
                recordSyncedAt(metadata.syncedAt, domain: domain, organizationId: organizationId)
            }
        } catch {
            // Non-fatal — toolbar may show never-synced until next load.
        }
    }

    func clearAll() async {
        writeGeneration += 1
        syncedAtByKey = [:]
        try? await disk.clearAll()
    }

    func clear(organizationId: String) async {
        writeGeneration += 1
        syncedAtByKey = syncedAtByKey.filter { !$0.key.hasPrefix("\(organizationId)|") }
        try? await disk.clear(organizationId: organizationId)
    }

    func clear(domain: String, organizationId: String) async {
        writeGeneration += 1
        syncedAtByKey.removeValue(forKey: cacheKey(domain: domain, organizationId: organizationId))
        try? await disk.clear(domain: domain, organizationId: organizationId)
    }

    private func cacheKey(domain: String, organizationId: String) -> String {
        "\(organizationId)|\(domain)"
    }

    private func recordSyncedAt(_ date: Date, domain: String, organizationId: String) {
        syncedAtByKey[cacheKey(domain: domain, organizationId: organizationId)] = date
    }
}

enum SnapshotDomain {
    static let hub = "hub"
    static let cargo = "cargo"
    static let galley = "galley"
    static let manifest = "manifest"
    static let supply = "supply"
    static let ask = "ask"
}
