import Foundation

/// File-backed read snapshots with per-domain sync metadata, scoped by organization.
@MainActor
final class SnapshotStore {
    struct Metadata: Codable, Sendable {
        var syncedAt: Date
        var organizationId: String
    }

    private struct Envelope<T: Codable>: Codable {
        var metadata: Metadata
        var payload: T
    }

    private struct MetadataEnvelope: Codable {
        var metadata: Metadata
    }

    private let fileManager = FileManager.default
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    func save<T: Codable>(_ payload: T, domain: String, organizationId: String) {
        let envelope = Envelope(
            metadata: Metadata(syncedAt: Date(), organizationId: organizationId),
            payload: payload
        )
        guard let data = try? encoder.encode(envelope) else { return }
        let dir = orgDirectory(for: organizationId)
        try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        try? data.write(to: fileURL(domain: domain, organizationId: organizationId), options: .atomic)
    }

    func load<T: Codable>(
        _ type: T.Type,
        domain: String,
        organizationId: String
    ) -> (payload: T, metadata: Metadata)? {
        guard let data = try? Data(contentsOf: fileURL(domain: domain, organizationId: organizationId)),
              let envelope = try? decoder.decode(Envelope<T>.self, from: data)
        else { return nil }
        guard envelope.metadata.organizationId == organizationId else { return nil }
        return (envelope.payload, envelope.metadata)
    }

    func syncedAt(domain: String, organizationId: String) -> Date? {
        loadMetadata(domain: domain, organizationId: organizationId)?.syncedAt
    }

    func lastSyncedLabel(domain: String, organizationId: String) -> String? {
        guard let meta = loadMetadata(domain: domain, organizationId: organizationId) else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return "Last synced \(formatter.localizedString(for: meta.syncedAt, relativeTo: Date()))"
    }

    func clearAll() {
        try? fileManager.removeItem(at: baseDirectory)
    }

    func clear(organizationId: String) {
        try? fileManager.removeItem(at: orgDirectory(for: organizationId))
    }

    private func loadMetadata(domain: String, organizationId: String) -> Metadata? {
        guard let data = try? Data(contentsOf: fileURL(domain: domain, organizationId: organizationId)),
              let envelope = try? decoder.decode(MetadataEnvelope.self, from: data)
        else { return nil }
        guard envelope.metadata.organizationId == organizationId else { return nil }
        return envelope.metadata
    }

    private var baseDirectory: URL {
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return support.appendingPathComponent("ration-snapshots", isDirectory: true)
    }

    private func orgDirectory(for organizationId: String) -> URL {
        baseDirectory.appendingPathComponent(organizationId, isDirectory: true)
    }

    private func fileURL(domain: String, organizationId: String) -> URL {
        orgDirectory(for: organizationId).appendingPathComponent("\(domain).json")
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
