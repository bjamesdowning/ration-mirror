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
                // Keep the bucket for the next reconnect.
            }
        }
        save(remaining)
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
