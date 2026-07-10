import Foundation
import MetricKit

/// Subscribes to MetricKit and archives privacy-safe Apple payloads locally for diagnostics.
final class PerformanceTelemetry: NSObject, MXMetricManagerSubscriber {
    static let shared = PerformanceTelemetry()

    private var isRegistered = false
    private let archive = MetricPayloadArchive()

    func registerIfNeeded() {
        guard !isRegistered else { return }
        MXMetricManager.shared.add(self)
        isRegistered = true
    }

    func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            let data = payload.jsonRepresentation()
            Task {
                await archive.persist(data, kind: .metrics)
            }
        }
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            let data = payload.jsonRepresentation()
            Task {
                await archive.persist(data, kind: .diagnostics)
            }
        }
    }
}

actor MetricPayloadArchive {
    enum Kind: String, Sendable {
        case metrics
        case diagnostics
    }

    private let fileManager: FileManager
    private let directory: URL
    private let retentionLimit: Int

    init(
        fileManager: FileManager = .default,
        directory: URL? = nil,
        retentionLimit: Int = 8
    ) {
        self.fileManager = fileManager
        self.retentionLimit = retentionLimit
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        self.directory = directory ?? support.appendingPathComponent("ration-metric-kit", isDirectory: true)
    }

    func persist(_ data: Data, kind: Kind, now: Date = Date()) {
        do {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            let timestamp = Int(now.timeIntervalSince1970 * 1_000)
            let filename = "\(kind.rawValue)-\(timestamp)-\(UUID().uuidString).json"
            try data.write(to: directory.appendingPathComponent(filename), options: .atomic)
            try pruneIfNeeded()
        } catch {
            // Diagnostics are best-effort and must never block app startup.
        }
    }

    func archivedFiles() -> [URL] {
        sortedArchiveFiles()
    }

    private func pruneIfNeeded() throws {
        let files = sortedArchiveFiles()
        guard files.count > retentionLimit else { return }
        for file in files.dropFirst(retentionLimit) {
            try fileManager.removeItem(at: file)
        }
    }

    private func sortedArchiveFiles() -> [URL] {
        let files = (try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        )) ?? []
        return files.sorted { lhs, rhs in
            let leftDate = try? lhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            let rightDate = try? rhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            return (leftDate ?? .distantPast) > (rightDate ?? .distantPast)
        }
    }
}
