import XCTest
@testable import Ration

@MainActor
final class HealthExportBackendFake: HealthExportBackend {
    var responses: [HealthExportPendingResponse] = []
    var calls: [(since: String?, scope: String?)] = []
    var acknowledgements = 0
    var error: Error?
    /// When set, the first pending call waits until `release()`.
    var holdFirstCall = false
    private var held: CheckedContinuation<Void, Never>?

    func healthExportPending(since: String?, scope: String?) async throws -> HealthExportPendingResponse {
        calls.append((since, scope))
        if holdFirstCall {
            holdFirstCall = false
            await withCheckedContinuation { held = $0 }
        }
        if let error { throw error }
        return responses.isEmpty ? Self.response() : responses.removeFirst()
    }

    func acknowledgeHealthExportClear() async throws {
        acknowledgements += 1
    }

    func release() {
        held?.resume()
        held = nil
    }

    static func response(
        samples: [HealthExportPendingResponse.Sample] = [],
        deletes: [HealthExportPendingResponse.Delete] = [],
        enabled: Bool = true,
        clearRequested: Bool = false,
        purge: Bool = false,
        truncated: Bool = false,
        syncedThrough: String = "2026-11-09T12:00:00.000Z",
        excluded: HealthExportPendingResponse.Excluded? = nil
    ) -> HealthExportPendingResponse {
        HealthExportPendingResponse(
            samples: samples,
            deletes: deletes,
            enabled: enabled,
            clearRequested: clearRequested,
            purge: purge,
            truncated: truncated,
            syncedThrough: syncedThrough,
            excluded: excluded
        )
    }
}

@MainActor
final class HealthExportCoordinatorTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() async throws {
        suiteName = "HealthExportCoordinatorTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() async throws {
        defaults.removePersistentDomain(forName: suiteName)
    }

    private func makeCoordinator(
        store: HealthExportStoreSpy? = nil,
        backend: HealthExportBackendFake? = nil,
        userId: String = "user-a",
        flagVisible: Bool = true
    ) -> HealthExportCoordinator {
        let coordinator = HealthExportCoordinator(
            store: store ?? HealthExportStoreSpy(),
            backend: backend ?? HealthExportBackendFake(),
            defaults: defaults,
            now: { Date(timeIntervalSince1970: 1_800_000_000) }
        )
        coordinator.contextProvider = {
            HealthExportContext(userId: userId, flagVisible: flagVisible)
        }
        return coordinator
    }

    func testFirstSyncIsFullThenIncrementalFromSyncedThroughLessTenMinutes() async {
        let store = HealthExportStoreSpy()
        let backend = HealthExportBackendFake()
        backend.responses = [
            HealthExportBackendFake.response(samples: [healthPendingSample("sync-1")]),
            HealthExportBackendFake.response(syncedThrough: "2026-11-09T13:00:00.000Z"),
        ]
        let coordinator = makeCoordinator(store: store, backend: backend)
        await coordinator.sync(.sessionReady)
        await coordinator.sync(.diaryChanged)
        XCTAssertEqual(backend.calls.map { $0.since }, [nil, "2026-11-09T11:50:00.000Z"])
        XCTAssertEqual(store.savedIdentifiers, ["ration:sync-1:dietaryEnergyConsumed"])
        XCTAssertEqual(
            HealthExportSyncState(defaults: defaults, userId: "user-a").syncedThrough,
            "2026-11-09T13:00:00.000Z"
        )
        XCTAssertNotNil(coordinator.lastSyncedAt)
        XCTAssertNil(coordinator.lastError)
    }

    func testPassiveTriggersStayOffTheNetworkWhenExportWasOff() async {
        let backend = HealthExportBackendFake()
        let coordinator = makeCoordinator(backend: backend)
        await coordinator.sync(.sceneActive)
        await coordinator.sync(.diaryChanged)
        await coordinator.sync(.backgroundRefresh)
        XCTAssertTrue(backend.calls.isEmpty)
    }

    func testNothingRunsWhenTheFlagIsHiddenOrNoNutrientIsAllowed() async {
        let backend = HealthExportBackendFake()
        await makeCoordinator(backend: backend, flagVisible: false).sync(.manual)
        let store = HealthExportStoreSpy()
        store.allowed = []
        let coordinator = makeCoordinator(store: store, backend: backend)
        await coordinator.sync(.manual)
        XCTAssertTrue(backend.calls.isEmpty)
    }

    func testAPurgeDeletesEverythingAcknowledgesAndResetsTheSyncPoint() async {
        let store = HealthExportStoreSpy()
        let backend = HealthExportBackendFake()
        HealthExportSyncState(defaults: defaults, userId: "user-a").syncedThrough =
            "2026-11-09T10:00:00.000Z"
        backend.responses = [
            HealthExportBackendFake.response(
                samples: [healthPendingSample("sync-1")],
                deletes: [healthPendingDelete("sync-1"), healthPendingDelete("sync-2")],
                enabled: false,
                clearRequested: true,
                purge: true
            ),
        ]
        let coordinator = makeCoordinator(store: store, backend: backend)
        await coordinator.sync(.sessionReady)
        XCTAssertTrue(store.savedIdentifiers.isEmpty)
        XCTAssertEqual(
            Set(store.events.compactMap { event -> [String]? in
                if case .delete(_, let ids) = event { return ids }
                return nil
            }.flatMap { $0 }).count,
            10
        )
        XCTAssertEqual(backend.acknowledgements, 1)
        XCTAssertNil(HealthExportSyncState(defaults: defaults, userId: "user-a").syncedThrough)
    }

    func testConcurrentTriggersRunOnceAndQueueOneRerun() async {
        let backend = HealthExportBackendFake()
        backend.holdFirstCall = true
        let coordinator = makeCoordinator(backend: backend)
        coordinator.trigger(.manual)
        for _ in 0..<20 where backend.calls.isEmpty {
            await Task.yield()
        }
        coordinator.trigger(.manual)
        coordinator.trigger(.manual)
        coordinator.trigger(.manual)
        XCTAssertEqual(backend.calls.count, 1)
        backend.release()
        await coordinator.sync(.manual)
        // The held run, one queued rerun, then the awaited trigger.
        XCTAssertLessThanOrEqual(backend.calls.count, 3)
        XCTAssertGreaterThanOrEqual(backend.calls.count, 2)
    }

    func testATruncatedIncrementalPullFallsBackToAFullPull() async {
        let backend = HealthExportBackendFake()
        HealthExportSyncState(defaults: defaults, userId: "user-a").syncedThrough =
            "2026-11-09T10:00:00.000Z"
        HealthExportSyncState(defaults: defaults, userId: "user-a").schemaVersion =
            HealthExportSyncState.currentSchemaVersion
        HealthExportSyncState(defaults: defaults, userId: "user-a").lastEnabled = true
        backend.responses = [
            HealthExportBackendFake.response(truncated: true),
            HealthExportBackendFake.response(),
        ]
        await makeCoordinator(backend: backend).sync(.sceneActive)
        XCTAssertEqual(backend.calls.map { $0.since }, ["2026-11-09T09:50:00.000Z", nil])
    }

    func testAFailedSaveKeepsTheSyncPointSoTheNextRunRetries() async {
        let store = HealthExportStoreSpy()
        store.failingIdentifiers = ["ration:sync-1:dietaryEnergyConsumed"]
        let backend = HealthExportBackendFake()
        backend.responses = [
            HealthExportBackendFake.response(samples: [healthPendingSample("sync-1")]),
        ]
        let coordinator = makeCoordinator(store: store, backend: backend)
        await coordinator.sync(.manual)
        XCTAssertEqual(coordinator.lastFailures, 1)
        XCTAssertNil(HealthExportSyncState(defaults: defaults, userId: "user-a").syncedThrough)
    }

    func testFlagOffAndMissingConsentAreQuiet() async {
        let backend = HealthExportBackendFake()
        backend.error = APIError.server(status: 403, message: "off", code: "FEATURE_DISABLED")
        let coordinator = makeCoordinator(backend: backend)
        await coordinator.sync(.manual)
        XCTAssertNil(coordinator.lastError)
        backend.error = APIError.transport("offline")
        await coordinator.sync(.manual)
        XCTAssertNotNil(coordinator.lastError)
    }

    func testStateIsPerPersonAndClearedOnForgetAndSignOut() async {
        let backend = HealthExportBackendFake()
        let coordinator = makeCoordinator(backend: backend, userId: "user-a")
        await coordinator.sync(.manual)
        let personA = HealthExportSyncState(defaults: defaults, userId: "user-a")
        let personB = HealthExportSyncState(defaults: defaults, userId: "user-b")
        XCTAssertNotNil(personA.syncedThrough)
        XCTAssertNil(personB.syncedThrough)
        coordinator.forget()
        XCTAssertNil(personA.syncedThrough)
        XCTAssertNil(coordinator.lastSyncedAt)
        personB.syncedThrough = "2026-11-09T10:00:00.000Z"
        HealthExportSyncState.clearAll(defaults: defaults)
        XCTAssertNil(personB.syncedThrough)
    }

    func testPurgeAllUsesScopeAllAndWorksWhileExportIsOff() async {
        let store = HealthExportStoreSpy()
        let backend = HealthExportBackendFake()
        backend.responses = [
            HealthExportBackendFake.response(
                deletes: [healthPendingDelete("sync-1")],
                enabled: false,
                purge: true
            ),
        ]
        let removed = await makeCoordinator(store: store, backend: backend).purgeAll()
        XCTAssertTrue(removed)
        XCTAssertEqual(backend.calls.first?.scope, "all")
        XCTAssertEqual(store.events.count, 5)
    }

    func testAFullSyncRecordsHowManyFoodsWereKeptOut() async {
        let backend = HealthExportBackendFake()
        backend.responses = [
            HealthExportBackendFake.response(
                excluded: HealthExportPendingResponse.Excluded(
                    aiEstimate: 2,
                    unconfirmed: 1,
                    notExportable: 3
                )
            ),
        ]
        let coordinator = makeCoordinator(backend: backend)
        await coordinator.sync(.enabled)
        XCTAssertEqual(coordinator.excluded, 6)
    }
}
