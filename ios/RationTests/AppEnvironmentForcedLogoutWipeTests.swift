import UIKit
import XCTest
@testable import Ration

/// Direct regression coverage for H-2's cross-account leakage scenario — a
/// forced 401 logout (`AuthManager.signOutLocal()`) must wipe
/// snapshots/session/image caches exactly like the explicit "Sign out"
/// action already does (`SettingsView.swift:144-146`), so a different user
/// signing in on the same shared device can't read the previous user's
/// cached data.
final class AppEnvironmentForcedLogoutWipeTests: XCTestCase {
    @MainActor
    func testForcedLogoutClearsSnapshotsForActiveOrg() async {
        let env = AppEnvironment()
        let orgId = "org_forced_logout_\(UUID().uuidString)"
        env.snapshots.save("cached-pantry-payload", domain: SnapshotDomain.cargo, organizationId: orgId)
        XCTAssertNotNil(
            env.snapshots.load(String.self, domain: SnapshotDomain.cargo, organizationId: orgId)
        )

        await env.auth.signOutLocal()

        XCTAssertNil(
            env.snapshots.load(String.self, domain: SnapshotDomain.cargo, organizationId: orgId)
        )
    }

    @MainActor
    func testForcedLogoutClearsSessionCache() async {
        let env = AppEnvironment()
        env.session.markAIConsentGranted()
        XCTAssertTrue(env.session.hasAIConsent)

        await env.auth.signOutLocal()

        XCTAssertNil(env.session.session)
        XCTAssertFalse(env.session.hasAIConsent)
    }

    @MainActor
    func testForcedLogoutClearsImageCache() async {
        let env = AppEnvironment()
        let url = URL(string: "https://ration.mayutic.com/api/organization/avatar/org_forced_logout_test")!
        // Seed the shared cache directly — there is no successful-fetch seam
        // to populate it otherwise, since `fetch(url:auth:)` requires a real
        // network round-trip with a valid access token.
        AuthImageLoader.shared.cache[url] = UIImage()
        XCTAssertNotNil(AuthImageLoader.shared.cache[url])

        await env.auth.signOutLocal()

        XCTAssertNil(AuthImageLoader.shared.cache[url])
    }

    @MainActor
    func testForcedLogoutClearsThemeCache() async {
        let env = AppEnvironment()
        env.theme.apply(.light)
        XCTAssertEqual(env.theme.theme, .light)
        XCTAssertEqual(UserDefaults.standard.string(forKey: ThemeStore.userDefaultsKey), "light")
        defer { UserDefaults.standard.removeObject(forKey: ThemeStore.userDefaultsKey) }

        await env.auth.signOutLocal()

        XCTAssertEqual(env.theme.theme, .dark)
        XCTAssertNil(UserDefaults.standard.string(forKey: ThemeStore.userDefaultsKey))
    }
}
