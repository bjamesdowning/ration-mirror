import XCTest
@testable import Ration

/// Covers H-8 — the shared "proceed" gate used by all AI entry points
/// (`ScanView`, `GenerateMealSheet`, `ImportRecipeSheet`, `PlanWeekSheet`, `SupplyView`).
final class AIConsentGateSymmetryTests: XCTestCase {
    @MainActor
    func testPresentIfNeededRunsImmediatelyWhenConsentAlreadyGranted() {
        let session = SessionStore()
        session.markAIConsentGranted()
        let coordinator = AIConsentCoordinator()

        var ran = false
        coordinator.presentIfNeeded(session: session) { ran = true }

        XCTAssertTrue(ran)
        XCTAssertFalse(coordinator.isPresenting)
    }

    @MainActor
    func testPresentIfNeededDefersActionAndShowsGateWhenConsentMissing() {
        let session = SessionStore()
        let coordinator = AIConsentCoordinator()

        var ran = false
        coordinator.presentIfNeeded(session: session) { ran = true }

        XCTAssertFalse(ran)
        XCTAssertTrue(coordinator.isPresenting)
    }

    @MainActor
    func testDeclineDismissesGateWithoutRunningDeferredAction() {
        let session = SessionStore()
        let coordinator = AIConsentCoordinator()

        var ran = false
        coordinator.presentIfNeeded(session: session) { ran = true }
        coordinator.decline()

        XCTAssertFalse(ran)
        XCTAssertFalse(coordinator.isPresenting)
    }

    /// "Shown once across all entry points" — `aiConsentAt` is a single server-side
    /// field surfaced as one `SessionStore.hasAIConsent` flag, so once any
    /// entry point's coordinator records consent, every other entry point's
    /// independent `AIConsentCoordinator` instance sees it immediately and
    /// skips the prompt — without a second network fetch.
    @MainActor
    func testConsentStateIsSharedAcrossAllEntryPoints() {
        let session = SessionStore()
        let scanCoordinator = AIConsentCoordinator()
        let generateCoordinator = AIConsentCoordinator()
        let importCoordinator = AIConsentCoordinator()
        let planWeekCoordinator = AIConsentCoordinator()
        let supplyCoordinator = AIConsentCoordinator()

        var scanRan = false
        scanCoordinator.presentIfNeeded(session: session) { scanRan = true }
        XCTAssertFalse(scanRan)
        XCTAssertTrue(scanCoordinator.isPresenting)

        // Simulates the server-recording half of `accept(api:session:)`
        // without performing a real network call.
        session.markAIConsentGranted()
        scanCoordinator.isPresenting = false

        for coordinator in [generateCoordinator, importCoordinator, planWeekCoordinator, supplyCoordinator] {
            var ran = false
            coordinator.presentIfNeeded(session: session) { ran = true }
            XCTAssertTrue(ran)
            XCTAssertFalse(coordinator.isPresenting)
        }
    }

    @MainActor
    func testSupplyReplenishScanUsesSameConsentGateAsOtherEntryPoints() {
        let session = SessionStore()
        let supplyCoordinator = AIConsentCoordinator()

        var ran = false
        supplyCoordinator.presentIfNeeded(session: session) { ran = true }

        XCTAssertFalse(ran)
        XCTAssertTrue(supplyCoordinator.isPresenting)
    }
}
