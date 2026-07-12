import Foundation

/// Coalesces concurrent snapshot loads per org+domain so `.task` and `.refreshable`
/// do not spawn duplicate network work or cancel each other mid-flight.
actor SnapshotLoadCoordinator {
    private var inFlight: [String: Task<Void, Never>] = [:]

    func run(key: String, operation: @escaping @Sendable () async -> Void) async {
        if let existing = inFlight[key] {
            await existing.value
            return
        }

        let task = Task.detached(priority: .userInitiated) {
            await operation()
        }
        inFlight[key] = task
        await task.value
        inFlight[key] = nil
    }

    static func key(organizationId: String, domain: String) -> String {
        "\(organizationId)|\(domain)"
    }
}
