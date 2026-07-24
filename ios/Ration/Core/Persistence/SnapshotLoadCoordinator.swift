import Foundation

/// Coalesces concurrent snapshot loads per org+domain so `.task` and `.refreshable`
/// do not spawn duplicate network work or cancel each other mid-flight.
///
/// Joiners re-enter after the in-flight task completes so a remounted ViewModel
/// always runs its own load, and the re-entry is registered in `inFlight`.
actor SnapshotLoadCoordinator {
    private var inFlight: [String: Task<Void, Never>] = [:]

    func run(key: String, operation: @escaping @Sendable () async -> Void) async {
        if let existing = inFlight[key] {
            await existing.value
            guard !Task.isCancelled else { return }
            // Owner's defer may not have cleared yet; remove the completed task
            // ourselves so re-entry cannot spin on a finished inFlight entry.
            if inFlight[key] == existing {
                inFlight[key] = nil
            }
            await run(key: key, operation: operation)
            return
        }

        let task = Task(priority: .userInitiated) {
            await operation()
        }
        inFlight[key] = task
        defer {
            if inFlight[key] == task {
                inFlight[key] = nil
            }
        }

        await withTaskCancellationHandler {
            await task.value
        } onCancel: {
            task.cancel()
        }
    }

    static func key(organizationId: String, domain: String) -> String {
        "\(organizationId)|\(domain)"
    }
}
