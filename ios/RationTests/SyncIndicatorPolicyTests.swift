import XCTest
@testable import Ration

@MainActor
final class SyncIndicatorPolicyTests: XCTestCase {
    func testSuppressesStaleDisclosureWhileRefreshing() {
        let staleDate = Date().addingTimeInterval(-3600)
        let state = DataSyncState.stale(staleDate)
        XCTAssertFalse(
            SyncIndicatorPolicy.shouldShowStaleDisclosure(
                state: state,
                isRefreshing: true,
                isInForegroundGrace: false,
                lastRefreshFailed: true
            )
        )
    }

    func testSuppressesStaleDisclosureDuringForegroundGrace() {
        let staleDate = Date().addingTimeInterval(-3600)
        let state = DataSyncState.stale(staleDate)
        XCTAssertFalse(
            SyncIndicatorPolicy.shouldShowStaleDisclosure(
                state: state,
                isRefreshing: false,
                isInForegroundGrace: true,
                lastRefreshFailed: true
            )
        )
    }

    func testShowsStaleDisclosureAfterFailedRefresh() {
        let staleDate = Date().addingTimeInterval(-3600)
        let state = DataSyncState.stale(staleDate)
        XCTAssertTrue(
            SyncIndicatorPolicy.shouldShowStaleDisclosure(
                state: state,
                isRefreshing: false,
                isInForegroundGrace: false,
                lastRefreshFailed: true
            )
        )
    }

    func testHidesStaleDisclosureWhenRefreshDidNotFail() {
        let staleDate = Date().addingTimeInterval(-3600)
        let state = DataSyncState.stale(staleDate)
        XCTAssertFalse(
            SyncIndicatorPolicy.shouldShowStaleDisclosure(
                state: state,
                isRefreshing: false,
                isInForegroundGrace: false,
                lastRefreshFailed: false
            )
        )
    }

    func testFreshStateNeverShowsStaleDisclosure() {
        XCTAssertFalse(
            SyncIndicatorPolicy.shouldShowStaleDisclosure(
                state: .fresh,
                isRefreshing: false,
                isInForegroundGrace: false,
                lastRefreshFailed: true
            )
        )
    }
}
