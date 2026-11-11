import Darwin
import Foundation

/// Versioned share handoff. Legacy UserDefaults keys stay readable for one release.
struct ShareImportRecord: Codable, Equatable, Sendable {
    var version: Int
    var id: String
    var url: String
    var userText: String?
    var savedAt: TimeInterval
    var state: String
}

enum ShareImportQueueError: Error {
    case lockFailed
    case full
}

enum ShareImportQueue {
    static let appGroupId = "group.com.mayutic.ration"
    static let fileName = "share-import-queue.json"
    static let lockName = "share-import-queue.lock"
    static let flagKey = "shareExtensionImportEnabled"
    static let maxRecords = 10
    static let unsubmittedTTL: TimeInterval = 24 * 60 * 60
    static let legacyURLKey = "pendingImportURL"
    static let legacyAtKey = "pendingImportURLAt"
    static let legacyAutoStartKey = "pendingImportAutoStart"
    static let legacyUserTextKey = "pendingImportUserText"

    static func enqueue(
        url: URL,
        userText: String?,
        now: Date = Date(),
        defaults: UserDefaults?,
        directory: URL
    ) throws -> [ShareImportRecord] {
        let record = ShareImportRecord(
            version: 1,
            id: UUID().uuidString,
            url: url.absoluteString,
            userText: userText,
            savedAt: now.timeIntervalSince1970,
            state: "saved"
        )
        let records = try mutate(directory: directory) { existing in
            var next = existing.filter { now.timeIntervalSince1970 - $0.savedAt < unsubmittedTTL }
            next.append(record)
            if next.count > maxRecords {
                next.removeFirst(next.count - maxRecords)
            }
            return next
        }
        defaults?.set(url.absoluteString, forKey: legacyURLKey)
        defaults?.set(now.timeIntervalSince1970, forKey: legacyAtKey)
        defaults?.set(false, forKey: legacyAutoStartKey)
        if let userText, !userText.isEmpty {
            defaults?.set(userText, forKey: legacyUserTextKey)
        } else {
            defaults?.removeObject(forKey: legacyUserTextKey)
        }
        return records
    }

    static func flagEnabled(_ defaults: UserDefaults?) -> Bool {
        defaults?.bool(forKey: flagKey) ?? false
    }

    private static func mutate(
        directory: URL,
        body: ([ShareImportRecord]) -> [ShareImportRecord]
    ) throws -> [ShareImportRecord] {
        let lockURL = directory.appendingPathComponent(lockName)
        let fileURL = directory.appendingPathComponent(fileName)
        let fd = open(lockURL.path, O_CREAT | O_RDWR, 0o600)
        guard fd >= 0 else { throw ShareImportQueueError.lockFailed }
        defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { throw ShareImportQueueError.lockFailed }
        defer { flock(fd, LOCK_UN) }
        var existing: [ShareImportRecord] = []
        if let data = try? Data(contentsOf: fileURL),
           let decoded = try? JSONDecoder().decode([ShareImportRecord].self, from: data)
        {
            existing = decoded
        }
        let next = body(existing)
        let data = try JSONEncoder().encode(next)
        let temporary = fileURL.appendingPathExtension("tmp")
        try data.write(to: temporary, options: .atomic)
        if FileManager.default.fileExists(atPath: fileURL.path) {
            _ = try FileManager.default.replaceItemAt(fileURL, withItemAt: temporary)
        } else {
            try FileManager.default.moveItem(at: temporary, to: fileURL)
        }
        return next
    }
}
