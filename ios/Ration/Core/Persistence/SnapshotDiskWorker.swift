import Foundation

/// Background file I/O and JSON encode/decode for org-scoped snapshots.
actor SnapshotDiskWorker {
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
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let rootDirectory: URL
    private var writeGeneration = 0

    init(rootDirectory: URL? = nil) {
        encoder = JSONEncoder()
        decoder = JSONDecoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        self.rootDirectory = rootDirectory
            ?? support.appendingPathComponent("ration-snapshots", isDirectory: true)
    }

    func save<T: Codable & Sendable>(
        _ payload: T,
        domain: String,
        organizationId: String,
        expectedGeneration: Int
    ) throws -> Bool {
        let signpost = PerformanceSignposts.begin("SnapshotSave")
        defer { PerformanceSignposts.end("SnapshotSave", id: signpost) }
        guard expectedGeneration == writeGeneration else { return false }
        let envelope = Envelope(
            metadata: Metadata(syncedAt: Date(), organizationId: organizationId),
            payload: payload
        )
        let data = try encoder.encode(envelope)
        let dir = orgDirectory(for: organizationId)
        try fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        // Soft-fail directory protection — file write still applies
        // `.completeFileProtectionUntilFirstUserAuthentication` atomically.
        try? fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: dir.path
        )
        let url = fileURL(domain: domain, organizationId: organizationId)
        try data.write(
            to: url,
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        )
        return true
    }

    func load<T: Codable & Sendable>(
        _ type: T.Type,
        domain: String,
        organizationId: String
    ) throws -> (payload: T, metadata: Metadata)? {
        let signpost = PerformanceSignposts.begin("SnapshotLoad")
        defer { PerformanceSignposts.end("SnapshotLoad", id: signpost) }
        let url = fileURL(domain: domain, organizationId: organizationId)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        let data = try Data(contentsOf: url)
        let envelope = try decoder.decode(Envelope<T>.self, from: data)
        guard envelope.metadata.organizationId == organizationId else { return nil }
        return (envelope.payload, envelope.metadata)
    }

    func loadMetadata(domain: String, organizationId: String) throws -> Metadata? {
        let url = fileURL(domain: domain, organizationId: organizationId)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        let data = try Data(contentsOf: url)
        let envelope = try decoder.decode(MetadataEnvelope.self, from: data)
        guard envelope.metadata.organizationId == organizationId else { return nil }
        return envelope.metadata
    }

    func clearAll() throws {
        writeGeneration += 1
        let base = baseDirectory
        guard fileManager.fileExists(atPath: base.path) else { return }
        try fileManager.removeItem(at: base)
    }

    func clear(organizationId: String) throws {
        writeGeneration += 1
        let dir = orgDirectory(for: organizationId)
        guard fileManager.fileExists(atPath: dir.path) else { return }
        try fileManager.removeItem(at: dir)
    }

    func clear(domain: String, organizationId: String) throws {
        writeGeneration += 1
        let url = fileURL(domain: domain, organizationId: organizationId)
        guard fileManager.fileExists(atPath: url.path) else { return }
        try fileManager.removeItem(at: url)
    }

    private var baseDirectory: URL {
        rootDirectory
    }

    private func orgDirectory(for organizationId: String) -> URL {
        baseDirectory.appendingPathComponent(organizationId, isDirectory: true)
    }

    private func fileURL(domain: String, organizationId: String) -> URL {
        orgDirectory(for: organizationId).appendingPathComponent("\(domain).json")
    }
}
