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

    init() {
        let auth = AuthManager()
        self.auth = auth
        self.api = RationAPI(client: APIClient(auth: auth))
        self.billing = BillingManager()
        self.snapshots = SnapshotStore()
        self.network = NetworkMonitor()
    }
}
