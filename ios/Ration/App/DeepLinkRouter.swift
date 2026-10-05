import Foundation
import Observation

struct ManifestAddEntryPrefill: Equatable, Sendable {
    let mealId: String
    let date: String
}

struct CargoDetailRoute: Hashable, Identifiable, Sendable {
    let id: String
}

struct MealDetailRoute: Hashable, Identifiable, Sendable {
    let id: String
    var isInitiallySelectedForSupply = false
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
    private(set) var galleyImportUserText: String?
    private(set) var manifestPlanWeekPending = false
    private(set) var manifestAddEntryPending: ManifestAddEntryPrefill?
    private(set) var supplyComposePending = false
    private(set) var cargoItemPending: String?
    private(set) var cargoEatPending: String?
    private(set) var mealPending: String?

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
        galleyImportUserText = nil
        manifestPlanWeekPending = false
        manifestAddEntryPending = nil
        supplyComposePending = false
        cargoItemPending = nil
        cargoEatPending = nil
        mealPending = nil
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
        case .cargoItem(let id):
            selectedTab = .cargo
            cargoItemPending = id
        case .meal(let id):
            selectedTab = .galley
            mealPending = id
        case .galleyGenerate:
            selectedTab = .galley
            galleyGeneratePending = true
        case .galleyImport(let url, let autoStart, let userText):
            selectedTab = .galley
            galleyImportPending = true
            galleyImportURL = url
            galleyImportAutoStart = autoStart
            galleyImportUserText = userText
        case .manifestPlanWeek:
            selectedTab = .manifest
            manifestPlanWeekPending = true
        case .manifestAddEntry(let mealId, let date):
            selectedTab = .manifest
            manifestAddEntryPending = ManifestAddEntryPrefill(mealId: mealId, date: date)
        case .manifestToday:
            selectedTab = .manifest
        case .supply:
            selectedTab = .supply
        case .supplyCompose:
            selectedTab = .supply
            supplyComposePending = true
        case .cargoEat(let id):
            selectedTab = .cargo
            cargoEatPending = id
        }
        queue.removeFirst()
    }

    func acknowledgeGalleyGenerate() { galleyGeneratePending = false }
    func acknowledgeGalleyImport() {
        galleyImportPending = false
        galleyImportURL = nil
        galleyImportAutoStart = false
        galleyImportUserText = nil
    }
    func acknowledgeManifestPlanWeek() { manifestPlanWeekPending = false }
    func acknowledgeManifestAddEntry() { manifestAddEntryPending = nil }
    func acknowledgeSupplyCompose() { supplyComposePending = false }
    func acknowledgeCargoItem() { cargoItemPending = nil }
    func acknowledgeCargoEat() { cargoEatPending = nil }
    func acknowledgeMeal() { mealPending = nil }
}

/// Cross-tab handoff must wait until the destination TabView page is selected.
/// Applying `NavigationPath` while the tab is off-screen makes SwiftUI call
/// `onDisappear` on the detail, which used to leave the list dock FAB visible.
enum DeepLinkTabHandoff {
    static func pendingDetailId(isCurrentTab: Bool, pendingId: String?) -> String? {
        guard isCurrentTab else { return nil }
        return pendingId
    }
}
