import XCTest
@testable import Ration

@MainActor
final class SnapshotRefreshOutcomeStoreTests: XCTestCase {
    func testRecordsFailureAndClearsOnSuccess() {
        let store = SnapshotRefreshOutcomeStore()
        store.recordFailure(organizationId: "org-1", domain: SnapshotDomain.hub)
        XCTAssertTrue(store.lastRefreshFailed(organizationId: "org-1", domain: SnapshotDomain.hub))

        store.recordSuccess(organizationId: "org-1", domain: SnapshotDomain.hub)
        XCTAssertFalse(store.lastRefreshFailed(organizationId: "org-1", domain: SnapshotDomain.hub))
    }

    func testClearAllRemovesFailures() {
        let store = SnapshotRefreshOutcomeStore()
        store.recordFailure(organizationId: "org-1", domain: SnapshotDomain.cargo)
        store.clearAll()
        XCTAssertFalse(store.lastRefreshFailed(organizationId: "org-1", domain: SnapshotDomain.cargo))
    }
}
