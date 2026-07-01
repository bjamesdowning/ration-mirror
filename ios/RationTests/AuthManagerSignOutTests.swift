import XCTest
@testable import Ration

/// Regression coverage for H-2 (+ bundled M-12) — see
/// `AuthManager.signOutLocal()`. Uses the real Keychain wrapper and a real
/// `AuthManager` instance, per this codebase's existing test convention of
/// real instances over mocks.
final class AuthManagerSignOutTests: XCTestCase {
    private let pkceVerifierKey = "pkce_verifier"

    override func tearDown() {
        Keychain.delete(pkceVerifierKey)
        super.tearDown()
    }

    @MainActor
    func testSignOutLocalClearsPKCEVerifier() async throws {
        Keychain.set("verifier-under-test", for: pkceVerifierKey)
        // Some sandboxed/simulator test runners lack the keychain-sharing
        // entitlement needed for `SecItemAdd`/`SecItemCopyMatching` to
        // persist at all (`errSecMissingEntitlement`). Skip rather than
        // fail in that case — on a properly provisioned device/simulator
        // run this still exercises the real Keychain round-trip.
        try XCTSkipIf(
            Keychain.get(pkceVerifierKey) == nil,
            "Keychain access unavailable in this test environment; cannot verify persistence-dependent cleanup here."
        )

        let auth = AuthManager()
        await auth.signOutLocal()

        XCTAssertNil(Keychain.get(pkceVerifierKey))
    }

    /// Guards the pre-existing partial-clear behavior against regression
    /// while the full-wipe hook (`onSignedOut`) is added alongside it.
    @MainActor
    func testSignOutLocalClearsTokensAndPhase() async {
        let auth = AuthManager()

        await auth.signOutLocal()

        XCTAssertEqual(auth.phase, .signedOut)
        XCTAssertFalse(auth.isSignedIn)
    }

    /// The seam test guaranteeing `AppEnvironment`'s full-wipe wiring can't
    /// silently regress: whatever `onSignedOut` is set to must run.
    @MainActor
    func testSignOutLocalInvokesOnSignedOutHook() async {
        let auth = AuthManager()
        var invoked = false
        auth.onSignedOut = { invoked = true }

        await auth.signOutLocal()

        XCTAssertTrue(invoked)
    }
}
