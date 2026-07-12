import Foundation
import Observation

/// Composition root — wires `AuthManager`, `APIClient`, and `RationAPI`.
/// Injected into the SwiftUI environment and shared by every feature.
@MainActor
@Observable
final class AppEnvironment {
    enum DeepLinkDestination: Equatable {
        case ask
        case scan
        case cargo
        case galleyGenerate
        case galleyImport
        case manifestPlanWeek
    }

    let auth: AuthManager
    let api: RationAPI
    let billing: BillingManager
    let snapshots: SnapshotStore
    let network: NetworkMonitor
    let session: SessionStore
    let nextActionDismiss: NextActionDismissStore
    let theme: ThemeStore
    let unitDisplayMode: UnitDisplayModeStore
    let ask: AskCoordinator
    let copilotScroll: CopilotScrollContext
    let tabDock: TabDockContext
    let launch: LaunchCoordinator
    let onboarding: OnboardingCoordinator
    let deepLinkRouter: DeepLinkRouter
    let snapshotLoads: SnapshotLoadCoordinator
    let lifecycle: AppLifecycleCoordinator
    let refreshOutcomes: SnapshotRefreshOutcomeStore
    private(set) var cargoDataRevision = 0

    init() {
        let auth = AuthManager()
        self.auth = auth
        let client = APIClient(auth: auth)
        let api = RationAPI(client: client)
        self.api = api
        let billing = BillingManager()
        self.billing = billing
        let snapshots = SnapshotStore()
        self.snapshots = snapshots
        self.network = NetworkMonitor()
        let session = SessionStore()
        self.session = session
        self.nextActionDismiss = NextActionDismissStore()
        let theme = ThemeStore()
        self.theme = theme
        let unitDisplayMode = UnitDisplayModeStore()
        self.unitDisplayMode = unitDisplayMode
        self.ask = AskCoordinator()
        self.copilotScroll = CopilotScrollContext()
        self.tabDock = TabDockContext()
        let launch = LaunchCoordinator()
        self.launch = launch
        let onboarding = OnboardingCoordinator()
        self.onboarding = onboarding
        self.deepLinkRouter = DeepLinkRouter()
        self.snapshotLoads = SnapshotLoadCoordinator()
        self.lifecycle = AppLifecycleCoordinator()
        let refreshOutcomes = SnapshotRefreshOutcomeStore()
        self.refreshOutcomes = refreshOutcomes

        client.orgAccessLostHandler = { [snapshots, refreshOutcomes, session] in
            guard !session.needsOrgSelection else { return }
            await snapshots.clearAll()
            refreshOutcomes.clearAll()
            session.beginOrgSelection(organizations: [])
            do {
                let response = try await api.organizations()
                session.beginOrgSelection(organizations: response.organizations)
            } catch {
                // Empty placeholder from beginOrgSelection above — user can create a group.
            }
        }

        // H-2: a forced 401 logout must match explicit sign-out's full wipe
        auth.onSignedOut = { [snapshots, billing, session, theme, unitDisplayMode, launch, onboarding, deepLinkRouter, refreshOutcomes] in
            await snapshots.clearAll()
            refreshOutcomes.clearAll()
            await billing.logOut()
            session.clear()
            theme.clear()
            unitDisplayMode.clear()
            launch.reset()
            onboarding.reset()
            deepLinkRouter.reset()
            AuthImageLoader.shared.clearAll()
        }
    }

    func notifyCargoDataChanged() {
        cargoDataRevision += 1
    }

    func openDeepLink(_ destination: DeepLinkDestination) {
        deepLinkRouter.enqueue(destination)
    }

    func loadSnapshot(
        organizationId: String,
        domain: String,
        operation: @escaping @Sendable () async -> Void
    ) async {
        let key = SnapshotLoadCoordinator.key(organizationId: organizationId, domain: domain)
        await snapshotLoads.run(key: key, operation: operation)
    }

    func warmSnapshotMetadata(organizationId: String) async {
        for domain in [
            SnapshotDomain.hub,
            SnapshotDomain.cargo,
            SnapshotDomain.galley,
            SnapshotDomain.manifest,
            SnapshotDomain.supply,
        ] {
            await snapshots.warmSyncMetadata(domain: domain, organizationId: organizationId)
        }
    }
}
