import Darwin
import Foundation

enum SharedImportStoreError: Error, Equatable {
    case lockFailed
    case full
}

protocol ShareImportStoring: AnyObject {
    var epoch: Int { get }
    func insert(_ record: ShareImportRecord) throws
    func update(_ record: ShareImportRecord) throws
    func record(id: String) -> ShareImportRecord?
    func peekOldest(now: Date) -> ShareImportRecord?
    func acknowledge(id: String)
    func clearAll()
}

/// Versioned FIFO in the App Group. The lock fails closed. A full queue is not overwritten.
final class SharedImportStore: ShareImportStoring {
    static let appGroupId = "group.com.mayutic.ration"
    static let fileName = "share-import-queue.json"
    static let lockName = "share-import-queue.lock"
    static let flagKey = "shareExtensionImportEnabled"
    static let epochKey = "shareImportSessionEpoch"
    static let maxRecords = 10
    static let unsubmittedTTL: TimeInterval = 24 * 60 * 60
    static let submittedTTL: TimeInterval = 3600 + 120
    static let legacyURLKey = "pendingImportURL"
    static let legacyAtKey = "pendingImportURLAt"
    static let legacyAutoStartKey = "pendingImportAutoStart"
    static let legacyUserTextKey = "pendingImportUserText"

    let directory: URL
    let defaults: UserDefaults?
    /// When true, writes throw and leave the file untouched.
    var failLock = false

    init(directory: URL, defaults: UserDefaults?) {
        self.directory = directory
        self.defaults = defaults
    }

    static func appGroup() -> SharedImportStore? {
        guard let directory = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) else { return nil }
        return SharedImportStore(directory: directory, defaults: UserDefaults(suiteName: appGroupId))
    }

    static func flagEnabled(_ defaults: UserDefaults?) -> Bool {
        defaults?.bool(forKey: flagKey) ?? false
    }

    var epoch: Int {
        defaults?.integer(forKey: Self.epochKey) ?? 0
    }

    func advanceEpoch() {
        defaults?.set(epoch + 1, forKey: Self.epochKey)
    }

    func insert(_ record: ShareImportRecord) throws {
        try mutate { existing in
            var next = existing
            if next.contains(where: { $0.id == record.id }) {
                return next
            }
            if next.count >= Self.maxRecords {
                throw SharedImportStoreError.full
            }
            next.append(record)
            return next
        }
    }

    func update(_ record: ShareImportRecord) throws {
        try mutate { existing in
            if record.sessionEpoch != epoch {
                return existing.filter { $0.id != record.id }
            }
            var next = existing
            if let index = next.firstIndex(where: { $0.id == record.id }) {
                next[index] = record
            } else if next.count >= Self.maxRecords {
                throw SharedImportStoreError.full
            } else {
                next.append(record)
            }
            return next
        }
    }

    func record(id: String) -> ShareImportRecord? {
        load().first { $0.id == id }
    }

    func peekOldest(now: Date = Date()) -> ShareImportRecord? {
        var found: ShareImportRecord?
        do {
            try mutate(now: now) { existing in
                found = existing.first { !$0.acknowledged }
                return existing
            }
        } catch {
            return nil
        }
        return found
    }

    func acknowledge(id: String) {
        try? mutate { existing in
            existing.map { record in
                guard record.id == id else { return record }
                var copy = record
                copy.acknowledged = true
                return copy
            }
        }
    }

    func clearAll() {
        try? mutate { _ in [] }
    }

    func hasPending(now: Date = Date()) -> Bool {
        peekOldest(now: now) != nil
    }

    private func prune(_ records: [ShareImportRecord], now: Date) -> [ShareImportRecord] {
        records.filter { record in
            let age = now.timeIntervalSince1970 - record.savedAt
            let submitted = record.requestId != nil || record.state == "processing" || record.state == "submitting"
            let limit = submitted ? Self.submittedTTL : Self.unsubmittedTTL
            return age < limit && !record.acknowledged
        }
    }

    private func load() -> [ShareImportRecord] {
        let url = directory.appendingPathComponent(Self.fileName)
        guard let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([ShareImportRecord].self, from: data)) ?? []
    }

    private func replace(_ records: [ShareImportRecord]) throws {
        let url = directory.appendingPathComponent(Self.fileName)
        let data = try JSONEncoder().encode(records)
        try data.write(to: url, options: .atomic)
    }

    private func mutate(
        now: Date = Date(),
        _ body: ([ShareImportRecord]) throws -> [ShareImportRecord]
    ) throws {
        if failLock { throw SharedImportStoreError.lockFailed }
        let lockURL = directory.appendingPathComponent(Self.lockName)
        let fd = open(lockURL.path, O_CREAT | O_RDWR, 0o600)
        guard fd >= 0 else { throw SharedImportStoreError.lockFailed }
        defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { throw SharedImportStoreError.lockFailed }
        defer { _ = flock(fd, LOCK_UN) }
        let next = try body(prune(load(), now: now))
        try replace(next)
    }
}
