import Foundation

extension AskViewModel {
    // MARK: - Snapshot persistence

    func persistSnapshotDebounced(touchActivity: Bool = true) {
        snapshotSaveTask?.cancel()
        snapshotSaveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            await self?.persistSnapshotNow(touchActivity: touchActivity)
        }
    }

    func scheduleImmediateSnapshotSave(touchActivity: Bool = true) {
        snapshotSaveTask?.cancel()
        snapshotSaveTask = Task { [weak self] in
            guard !Task.isCancelled else { return }
            await self?.persistSnapshotNow(touchActivity: touchActivity)
        }
    }
}
