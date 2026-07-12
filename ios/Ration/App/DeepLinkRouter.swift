import Foundation
import Observation

/// Phase-aware deep-link queue — stores intent until the tab shell is ready,
/// then exposes one-shot flags for feature sheets.
@MainActor
@Observable
final class DeepLinkRouter {
    private var queue: [AppEnvironment.DeepLinkDestination] = []
    private(set) var galleyGeneratePending = false
    private(set) var galleyImportPending = false
    private(set) var manifestPlanWeekPending = false

    var pending: AppEnvironment.DeepLinkDestination? {
        queue.first
    }

    func enqueue(_ destination: AppEnvironment.DeepLinkDestination) {
        guard !queue.contains(destination) else { return }
        queue.append(destination)
    }

    func reset() {
        queue = []
        galleyGeneratePending = false
        galleyImportPending = false
        manifestPlanWeekPending = false
    }

    /// Applies the pending destination once startup and org context are ready.
    func replayPending(
        selectedTab: inout Int,
        openAskSheet: () -> Void,
        openScan: () -> Void
    ) {
        guard let destination = queue.first else { return }
        switch destination {
        case .ask:
            openAskSheet()
        case .scan:
            openScan()
        case .cargo:
            selectedTab = 1
        case .galleyGenerate:
            selectedTab = 2
            galleyGeneratePending = true
        case .galleyImport:
            selectedTab = 2
            galleyImportPending = true
        case .manifestPlanWeek:
            selectedTab = 3
            manifestPlanWeekPending = true
        }
        queue.removeFirst()
    }

    func acknowledgeGalleyGenerate() { galleyGeneratePending = false }
    func acknowledgeGalleyImport() { galleyImportPending = false }
    func acknowledgeManifestPlanWeek() { manifestPlanWeekPending = false }
}
