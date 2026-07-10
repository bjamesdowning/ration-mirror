import XCTest
@testable import Ration

final class SnapshotRefreshPolicyTests: XCTestCase {
    @MainActor
    func testRestoreIfAvailableAppliesPayload() async {
        let store = SnapshotStore()
        let orgId = "org-swr-\(UUID().uuidString)"
        defer { Task { await store.clear(organizationId: orgId) } }

        await store.save(["count": 3], domain: SnapshotDomain.cargo, organizationId: orgId)

        var applied: [String: Int]?
        let restored = await SnapshotRefreshPolicy.restoreIfAvailable(
            snapshots: store,
            type: [String: Int].self,
            domain: SnapshotDomain.cargo,
            organizationId: orgId
        ) { payload in
            applied = payload
        }

        XCTAssertTrue(restored)
        XCTAssertEqual(applied?["count"], 3)
    }

    @MainActor
    func testRestoreIfAvailableReturnsFalseWhenMissing() async {
        let store = SnapshotStore()
        let orgId = "org-swr-missing-\(UUID().uuidString)"

        let restored = await SnapshotRefreshPolicy.restoreIfAvailable(
            snapshots: store,
            type: [String: Int].self,
            domain: SnapshotDomain.cargo,
            organizationId: orgId
        ) { _ in }

        XCTAssertFalse(restored)
    }

    func testModeSpecificContentDoesNotTreatUnrelatedSnapshotAsUsable() {
        XCTAssertFalse(SnapshotRefreshPolicy.hasUsableContent(
            hasSnapshot: true,
            modeSpecificItemCount: 0
        ))
        XCTAssertTrue(SnapshotRefreshPolicy.hasUsableContent(
            hasSnapshot: true,
            modeSpecificItemCount: 2
        ))
    }

    func testRefreshFailureMessageDisclosesCachedFallback() {
        XCTAssertEqual(
            SnapshotRefreshPolicy.refreshFailureMessage(
                feature: "Cargo",
                detail: "Server unavailable"
            ),
            "Couldn't refresh Cargo. Showing cached data. Server unavailable"
        )
    }
}

final class SnapshotStoreAsyncTests: XCTestCase {
    @MainActor
    func testFreshWhenRecentlySynced() async {
        let store = SnapshotStore()
        let orgId = "test-org-sync-fresh"
        await store.save(["items": []] as [String: [String]], domain: "cargo", organizationId: orgId)
        let state = store.syncState(domain: "cargo", organizationId: orgId, online: true)
        XCTAssertEqual(state, .fresh)
        await store.clear(organizationId: orgId)
    }

    @MainActor
    func testOfflineWhenNotOnline() async {
        let store = SnapshotStore()
        let orgId = "test-org-sync-offline"
        await store.save(["items": []] as [String: [String]], domain: "cargo", organizationId: orgId)
        let state = store.syncState(domain: "cargo", organizationId: orgId, online: false)
        if case .offline = state {
            XCTAssertTrue(true)
        } else {
            XCTFail("Expected offline state")
        }
        await store.clear(organizationId: orgId)
    }

    @MainActor
    func testSnapshotRoundTrip() async {
        let store = SnapshotStore()
        let orgId = "org-async-\(UUID().uuidString)"
        defer { Task { await store.clear(organizationId: orgId) } }

        await store.save("payload", domain: SnapshotDomain.cargo, organizationId: orgId)
        let loaded = await store.load(String.self, domain: SnapshotDomain.cargo, organizationId: orgId)
        XCTAssertEqual(loaded?.payload, "payload")
    }

    func testClearInvalidatesStaleDiskWriteGeneration() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("snapshot-worker-\(UUID().uuidString)", isDirectory: true)
        let worker = SnapshotDiskWorker(rootDirectory: directory)
        defer { try? FileManager.default.removeItem(at: directory) }

        try await worker.clearAll()
        let staleWriteSucceeded = try await worker.save(
            "previous-user-data",
            domain: SnapshotDomain.ask,
            organizationId: "old-org",
            expectedGeneration: 0
        )
        let currentWriteSucceeded = try await worker.save(
            "current-user-data",
            domain: SnapshotDomain.ask,
            organizationId: "new-org",
            expectedGeneration: 1
        )

        XCTAssertFalse(staleWriteSucceeded)
        XCTAssertTrue(currentWriteSucceeded)
    }
}

final class MetricPayloadArchiveTests: XCTestCase {
    func testArchivePersistsPayloadAndEnforcesRetention() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("metric-archive-\(UUID().uuidString)", isDirectory: true)
        let archive = MetricPayloadArchive(directory: directory, retentionLimit: 2)
        defer { try? FileManager.default.removeItem(at: directory) }

        await archive.persist(Data("one".utf8), kind: .metrics, now: Date(timeIntervalSince1970: 1))
        await archive.persist(Data("two".utf8), kind: .metrics, now: Date(timeIntervalSince1970: 2))
        await archive.persist(Data("three".utf8), kind: .diagnostics, now: Date(timeIntervalSince1970: 3))

        let files = await archive.archivedFiles()
        XCTAssertEqual(files.count, 2)
        XCTAssertTrue(files.allSatisfy { $0.pathExtension == "json" })
    }
}
