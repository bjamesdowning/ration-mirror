import XCTest
@testable import Ration

final class NextActionDismissStoreTests: XCTestCase {
    @MainActor
    func testDismissIncrementsRevisionAndPersists() {
        let defaults = UserDefaults(suiteName: "NextActionDismissStoreTests")!
        defaults.removePersistentDomain(forName: "NextActionDismissStoreTests")
        let store = NextActionDismissStore(defaults: defaults)

        XCTAssertFalse(store.isDismissed(actionKey: "scan", organizationId: "org_1"))
        let before = store.revision
        store.dismiss(actionKey: "scan", organizationId: "org_1")
        XCTAssertGreaterThan(store.revision, before)
        XCTAssertTrue(store.isDismissed(actionKey: "scan", organizationId: "org_1"))
        XCTAssertFalse(store.isDismissed(actionKey: "scan", organizationId: "org_2"))
    }

    @MainActor
    func testClearAllRemovesEveryOrganization() {
        let suite = "NextActionDismissStoreClearAllTests"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let store = NextActionDismissStore(defaults: defaults)

        store.dismiss(actionKey: "scan", organizationId: "org_1")
        store.dismiss(actionKey: "supply", organizationId: "org_2")
        XCTAssertTrue(store.isDismissed(actionKey: "scan", organizationId: "org_1"))
        XCTAssertTrue(store.isDismissed(actionKey: "supply", organizationId: "org_2"))

        let before = store.revision
        store.clearAll()
        XCTAssertGreaterThan(store.revision, before)
        XCTAssertFalse(store.isDismissed(actionKey: "scan", organizationId: "org_1"))
        XCTAssertFalse(store.isDismissed(actionKey: "supply", organizationId: "org_2"))
    }
}
