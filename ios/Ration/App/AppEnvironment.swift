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
    private(set) var deepLinkDestination: DeepLinkDestination?
    private(set) var cargoDataRevision = 0

    init() {
        let auth = AuthManager()
        self.auth = auth
        self.api = RationAPI(client: APIClient(auth: auth))
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

        // H-2: a forced 401 logout must match explicit sign-out's full wipe
        auth.onSignedOut = { [snapshots, billing, session, theme, unitDisplayMode] in
            snapshots.clearAll()
            await billing.logOut()
            session.clear()
            theme.clear()
            unitDisplayMode.clear()
            AuthImageLoader.shared.clearAll()
        }
    }

    func notifyCargoDataChanged() {
        cargoDataRevision += 1
    }

    func openDeepLink(_ destination: DeepLinkDestination) {
        deepLinkDestination = destination
    }

    func consumeDeepLink() {
        deepLinkDestination = nil
    }
}
