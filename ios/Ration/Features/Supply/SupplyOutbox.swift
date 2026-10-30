import Foundation

enum SupplyOutbox {
    private static let key = "supply.outbox.v1"

    static func enqueue(_ operation: SupplyOutboxOperation, listId: String, baseRevision: Int) {
        var store = load()
        var bucket = store[listId] ?? Bucket(baseRevision: baseRevision, operations: [])
        bucket.operations.append(operation)
        store[listId] = bucket
        save(store)
    }

    static func replay(api: RationAPI) async {
        let store = load()
        guard !store.isEmpty else { return }
        var remaining = store
        for (listId, bucket) in store {
            do {
                _ = try await api.replaySupplyOperations(
                    listId: listId,
                    baseRevision: bucket.baseRevision,
                    operations: bucket.operations
                )
                remaining.removeValue(forKey: listId)
            } catch {
                if isPermanentRejection(error) {
                    remaining.removeValue(forKey: listId)
                }
            }
        }
        save(remaining)
    }

    /// Queued edits belong to the signed-in account.
    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    /// The server will never accept these operations (list gone, no access, invalid);
    /// everything else (offline, 401, 408, 429, 5xx) retries on the next reconnect.
    private static func isPermanentRejection(_ error: Error) -> Bool {
        guard let status = (error as? APIError)?.statusCode else { return false }
        return (400..<500).contains(status) && ![401, 408, 429].contains(status)
    }

    private struct Bucket: Codable {
        var baseRevision: Int
        var operations: [SupplyOutboxOperation]
    }

    private static func load() -> [String: Bucket] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [:] }
        return (try? JSONDecoder().decode([String: Bucket].self, from: data)) ?? [:]
    }

    private static func save(_ store: [String: Bucket]) {
        if let data = try? JSONEncoder().encode(store) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
