import Foundation
import Observation

/// Tracks foreground timing and per-tab refresh tokens for quiet revalidate UX.
@MainActor
@Observable
final class AppLifecycleCoordinator {
    static let foregroundGraceDuration: TimeInterval = 15

    private(set) var lastBecameActive = Date()
    private var refreshTokensByTab: [Int: Int] = [:]

    var isInForegroundGrace: Bool {
        Date().timeIntervalSince(lastBecameActive) < Self.foregroundGraceDuration
    }

    func recordBecameActive() {
        lastBecameActive = Date()
    }

    func bumpRefresh(forTab tab: Int) {
        refreshTokensByTab[tab, default: 0] += 1
    }

    func refreshToken(forTab tab: Int) -> Int {
        refreshTokensByTab[tab, default: 0]
    }
}
