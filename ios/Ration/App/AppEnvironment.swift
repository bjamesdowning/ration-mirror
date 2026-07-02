import Foundation
import Observation

/// Composition root — wires `AuthManager`, `APIClient`, and `RationAPI`.
/// Injected into the SwiftUI environment and shared by every feature.
@MainActor
@Observable
final class AppEnvironment {
    let auth: AuthManager
    let api: RationAPI
    let billing: BillingManager
    let snapshots: SnapshotStore
    let network: NetworkMonitor
    let session: SessionStore
    let nextActionDismiss: NextActionDismissStore
    let theme: ThemeStore
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

        // H-2: a forced 401 logout must match explicit sign-out's full wipe
        // (`SettingsView.swift`'s "Sign out" action) so cached pantry/session/
        // image data from the signed-out user isn't readable by the next
        // person who signs in on the same shared device.
        auth.onSignedOut = { [snapshots, billing, session, theme] in
            snapshots.clearAll()
            await billing.logOut()
            session.clear()
            theme.clear()
            AuthImageLoader.shared.clearAll()
        }
    }

    func notifyCargoDataChanged() {
        cargoDataRevision += 1
    }
}
