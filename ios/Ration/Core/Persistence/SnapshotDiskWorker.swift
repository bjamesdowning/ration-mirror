import CryptoKit
import Foundation

/// Snapshot isolation: org-shared hub/cargo/galley vs private user+org Manifest/nutrition.
enum SnapshotScope: Sendable, Hashable {
    case organization(String)
    case userOrganization(userId: String, organizationId: String)

    var organizationId: String {
        switch self {
        case let .organization(organizationId):
            return organizationId
        case let .userOrganization(_, organizationId):
            return organizationId
        }
    }

    /// Opaque directory segment for private scopes (SHA256 hex prefix of `userId|organizationId`).
    var privateFingerprint: String? {
        switch self {
        case .organization:
            return nil
        case let .userOrganization(userId, organizationId):
            return Self.fingerprint(userId: userId, organizationId: organizationId)
        }
    }

    var isPrivate: Bool {
        privateFingerprint != nil
    }

    static func fingerprint(userId: String, organizationId: String) -> String {
        let material = "\(userId)|\(organizationId)"
        let digest = SHA256.hash(data: Data(material.utf8))
        return digest.prefix(16).map { String(format: "%02x", $0) }.joined()
    }
}

/// Background file I/O and JSON encode/decode for scoped snapshots.
actor SnapshotDiskWorker {
    struct Metadata: Codable, Sendable {
        var syncedAt: Date
        var organizationId: String
        /// Opaque private-scope fingerprint when scoped to user+org; nil for org-only.
        var scopeFingerprint: String?
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
        scope: SnapshotScope,
        expectedGeneration: Int
    ) throws -> Bool {
        let signpost = PerformanceSignposts.begin("SnapshotSave")
        defer { PerformanceSignposts.end("SnapshotSave", id: signpost) }
        guard expectedGeneration == writeGeneration else { return false }
        let envelope = Envelope(
            metadata: Metadata(
                syncedAt: Date(),
                organizationId: scope.organizationId,
                scopeFingerprint: scope.privateFingerprint
            ),
            payload: payload
        )
        let data = try encoder.encode(envelope)
        let dir = directory(for: scope)
        try fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        // Soft-fail directory protection — file write still applies
        // `.completeFileProtectionUntilFirstUserAuthentication` atomically.
        try? fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: dir.path
        )
        let url = fileURL(domain: domain, scope: scope)
        try data.write(
            to: url,
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        )
        return true
    }

    /// Org-scoped convenience (hub / cargo / galley / supply / ask).
    func save<T: Codable & Sendable>(
        _ payload: T,
        domain: String,
        organizationId: String,
        expectedGeneration: Int
    ) throws -> Bool {
        try save(
            payload,
            domain: domain,
            scope: .organization(organizationId),
            expectedGeneration: expectedGeneration
        )
    }

    func load<T: Codable & Sendable>(
        _ type: T.Type,
        domain: String,
        scope: SnapshotScope
    ) throws -> (payload: T, metadata: Metadata)? {
        let signpost = PerformanceSignposts.begin("SnapshotLoad")
        defer { PerformanceSignposts.end("SnapshotLoad", id: signpost) }
        let url = fileURL(domain: domain, scope: scope)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        let data = try Data(contentsOf: url)
        let envelope = try decoder.decode(Envelope<T>.self, from: data)
        guard envelope.metadata.organizationId == scope.organizationId else { return nil }
        if let expected = scope.privateFingerprint {
            // Private reads never accept org-only or mismatched fingerprints.
            guard envelope.metadata.scopeFingerprint == expected else { return nil }
        } else if envelope.metadata.scopeFingerprint != nil {
            return nil
        }
        return (envelope.payload, envelope.metadata)
    }

    func load<T: Codable & Sendable>(
        _ type: T.Type,
        domain: String,
        organizationId: String
    ) throws -> (payload: T, metadata: Metadata)? {
        try load(type, domain: domain, scope: .organization(organizationId))
    }

    func loadMetadata(domain: String, scope: SnapshotScope) throws -> Metadata? {
        let url = fileURL(domain: domain, scope: scope)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        let data = try Data(contentsOf: url)
        let envelope = try decoder.decode(MetadataEnvelope.self, from: data)
        guard envelope.metadata.organizationId == scope.organizationId else { return nil }
        if let expected = scope.privateFingerprint {
            guard envelope.metadata.scopeFingerprint == expected else { return nil }
        } else if envelope.metadata.scopeFingerprint != nil {
            return nil
        }
        return envelope.metadata
    }

    func loadMetadata(domain: String, organizationId: String) throws -> Metadata? {
        try loadMetadata(domain: domain, scope: .organization(organizationId))
    }

    func clearAll() throws {
        writeGeneration += 1
        let base = baseDirectory
        guard fileManager.fileExists(atPath: base.path) else { return }
        try fileManager.removeItem(at: base)
    }

    /// Clears org-shared and nested private scopes for one organization.
    func clear(organizationId: String) throws {
        writeGeneration += 1
        let dir = orgDirectory(for: organizationId)
        guard fileManager.fileExists(atPath: dir.path) else { return }
        try fileManager.removeItem(at: dir)
    }

    func clear(scope: SnapshotScope) throws {
        writeGeneration += 1
        switch scope {
        case let .organization(organizationId):
            try clear(organizationId: organizationId)
        case .userOrganization:
            let dir = directory(for: scope)
            guard fileManager.fileExists(atPath: dir.path) else { return }
            try fileManager.removeItem(at: dir)
        }
    }

    func clear(domain: String, scope: SnapshotScope) throws {
        writeGeneration += 1
        let url = fileURL(domain: domain, scope: scope)
        guard fileManager.fileExists(atPath: url.path) else { return }
        try fileManager.removeItem(at: url)
    }

    func clear(domain: String, organizationId: String) throws {
        try clear(domain: domain, scope: .organization(organizationId))
    }

    /// Deletes legacy org-only `manifest.json` files so private Manifest never falls back to them.
    func clearLegacyManifestSnapshots() throws {
        writeGeneration += 1
        let base = baseDirectory
        guard fileManager.fileExists(atPath: base.path) else { return }
        let orgDirs = try fileManager.contentsOfDirectory(
            at: base,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        )
        for orgDir in orgDirs {
            var isDirectory: ObjCBool = false
            guard fileManager.fileExists(atPath: orgDir.path, isDirectory: &isDirectory),
                  isDirectory.boolValue
            else { continue }
            let legacy = orgDir.appendingPathComponent("\(SnapshotDomain.manifest).json")
            if fileManager.fileExists(atPath: legacy.path) {
                try fileManager.removeItem(at: legacy)
            }
        }
    }

    private var baseDirectory: URL {
        rootDirectory
    }

    private func orgDirectory(for organizationId: String) -> URL {
        baseDirectory.appendingPathComponent(organizationId, isDirectory: true)
    }

    private func directory(for scope: SnapshotScope) -> URL {
        let orgDir = orgDirectory(for: scope.organizationId)
        guard let fingerprint = scope.privateFingerprint else { return orgDir }
        return orgDir
            .appendingPathComponent("u_\(fingerprint)", isDirectory: true)
    }

    private func fileURL(domain: String, scope: SnapshotScope) -> URL {
        directory(for: scope).appendingPathComponent("\(domain).json")
    }
}
