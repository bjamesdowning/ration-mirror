import Foundation
import Network
import Observation

/// Tracks network reachability for offline banners and snapshot fallbacks.
@MainActor
@Observable
final class NetworkMonitor {
    private(set) var isOnline = true
    private(set) var onlineGeneration = 0
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.mayutic.ration.network")
    private var offlineDebounceTask: Task<Void, Never>?

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.handlePathUpdate(path)
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }

    private func handlePathUpdate(_ path: NWPath) {
        offlineDebounceTask?.cancel()

        if path.status == .satisfied {
            let wasOffline = !isOnline
            isOnline = true
            if wasOffline {
                onlineGeneration += 1
            }
            return
        }

        offlineDebounceTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            isOnline = false
        }
    }
}
