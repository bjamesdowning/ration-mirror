import Foundation
import Observation

struct ManifestAddEntryPrefill: Equatable, Sendable {
    let mealId: String
    let date: String
}

/// Phase-aware deep-link queue — stores intent until the tab shell is ready,
/// then exposes one-shot flags for feature sheets.
@MainActor
@Observable
final class DeepLinkRouter {
    private var queue: [AppEnvironment.DeepLinkDestination] = []
    private(set) var galleyGeneratePending = false
    private(set) var galleyImportPending = false
    private(set) var galleyImportURL: String?
    private(set) var galleyImportAutoStart = false
    private(set) var manifestPlanWeekPending = false
    private(set) var manifestAddEntryPending: ManifestAddEntryPrefill?

    var pending: AppEnvironment.DeepLinkDestination? {
        queue.first
    }

    func enqueue(_ destination: AppEnvironment.DeepLinkDestination) {
        if case .galleyImport = destination {
            queue.removeAll {
                if case .galleyImport = $0 { return true }
                return false
            }
        } else {
            guard !queue.contains(destination) else { return }
        }
        queue.append(destination)
    }

    func reset() {
        queue = []
        galleyGeneratePending = false
        galleyImportPending = false
        galleyImportURL = nil
        galleyImportAutoStart = false
        manifestPlanWeekPending = false
        manifestAddEntryPending = nil
    }

    /// Applies the pending destination once startup and org context are ready.
    func replayPending(
        selectedTab: inout MainTab,
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
            selectedTab = .cargo
        case .galleyGenerate:
            selectedTab = .galley
            galleyGeneratePending = true
        case .galleyImport(let url, let autoStart):
            selectedTab = .galley
            galleyImportPending = true
            galleyImportURL = url
            galleyImportAutoStart = autoStart
        case .manifestPlanWeek:
            selectedTab = .manifest
            manifestPlanWeekPending = true
        case .manifestAddEntry(let mealId, let date):
            selectedTab = .manifest
            manifestAddEntryPending = ManifestAddEntryPrefill(mealId: mealId, date: date)
        }
        queue.removeFirst()
    }

    func acknowledgeGalleyGenerate() { galleyGeneratePending = false }
    func acknowledgeGalleyImport() {
        galleyImportPending = false
        galleyImportURL = nil
        galleyImportAutoStart = false
    }
    func acknowledgeManifestPlanWeek() { manifestPlanWeekPending = false }
    func acknowledgeManifestAddEntry() { manifestAddEntryPending = nil }
}
