import Security
import XCTest
@testable import Ration

@MainActor
final class ShareImportCoordinatorTests: XCTestCase {
    func testConsentAndLaneSubmitOnceWithoutASecondTap() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make())
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.submitCount, 1)
        XCTAssertEqual(service.grantCount, 0)
        XCTAssertEqual(coordinator.preparedHost, "example.com")
        XCTAssertEqual(coordinator.preparedCost, 3)
        XCTAssertEqual(coordinator.state, .started)
        XCTAssertEqual(store.records.first?.ownerUserId, "user-1")
        XCTAssertEqual(store.records.first?.organizationId, "org-1")
        XCTAssertEqual(store.records.first?.state, "processing")
        XCTAssertEqual(
            service.submitBodies.first?.clientRequestId,
            store.records.first?.clientRequestId
        )
        let processing = coordinator.trace.firstIndex(of: "processing")
        let started = coordinator.trace.firstIndex(of: "ui:started")
        XCTAssertNotNil(processing)
        XCTAssertNotNil(started)
        XCTAssertLessThan(processing ?? 0, started ?? 0)
        coordinator.noteTimerElapsed()
        XCTAssertEqual(coordinator.completionCount, 0)
        XCTAssertTrue(coordinator.userRequestedFinish())
        XCTAssertEqual(coordinator.completionCount, 1)
    }

    func testMissingConsentDoesNotSubmitUntilAllowed() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make(hasConsent: false))
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .needsConsent)
        XCTAssertEqual(coordinator.submitCount, 0)
        XCTAssertEqual(ShareImportCopy.disclosure, AIConsentCopy.disclosure)
        await coordinator.allowAndImport()
        XCTAssertEqual(service.grantCount, 1)
        XCTAssertEqual(coordinator.submitCount, 1)
        XCTAssertEqual(coordinator.state, .started)
    }

    func testLaneOffDoesNotSubmit() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make(share: false))
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .unavailable)
        XCTAssertEqual(coordinator.submitCount, 0)
        XCTAssertFalse(coordinator.claimsSuccess)
    }

    func testSourceLaneOffDoesNotSubmit() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make(web: false))
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .unavailable)
        XCTAssertEqual(coordinator.submitCount, 0)
    }

    func testInsufficientCreditsShowsTheAmountAndDoesNotSubmit() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make(credits: 1, cost: 3))
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .needsCredits(required: 3))
        XCTAssertEqual(coordinator.submitCount, 0)
        XCTAssertEqual(
            ShareImportCopy.insufficientCredits(required: 3),
            "This import uses 3 credits. Open Ration from your Home Screen to add credits."
        )
        XCTAssertFalse(coordinator.claimsSuccess)
    }

    func testOfflineDoesNotSubmit() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make(), accessError: .offline)
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .offline)
        XCTAssertEqual(coordinator.submitCount, 0)
        XCTAssertNil(store.records.first?.ownerUserId)
        XCTAssertFalse(coordinator.claimsSuccess)
    }

    func testUnauthorizedDoesNotSubmit() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make(), accessError: .unauthorized)
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .unauthorized)
        XCTAssertEqual(coordinator.submitCount, 0)
        XCTAssertNil(store.records.first?.ownerUserId)
    }

    func testRateLimitDoesNotClaimSuccess() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make(), submitError: .rateLimited)
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .rateLimited)
        XCTAssertEqual(coordinator.submitCount, 1)
        XCTAssertFalse(coordinator.claimsSuccess)
        coordinator.noteTimerElapsed()
        XCTAssertEqual(coordinator.completionCount, 0)
    }

    func testDuplicateDoesNotClaimSuccess() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(
            session: .make(),
            submitError: .duplicate(name: "Soup")
        )
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .duplicate(name: "Soup"))
        XCTAssertFalse(coordinator.claimsSuccess)
        XCTAssertEqual(store.records.first?.acknowledged, true)
    }

    func testFailedJobDoesNotClaimSuccess() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make())
        service.statuses = [.success(.make(status: "failed", error: "No recipe"))]
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .failed("No recipe"))
        XCTAssertFalse(coordinator.claimsSuccess)
    }

    func testSiteBlockedNeedsTheAppAndDoesNotClaimSuccess() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make())
        service.statuses = [.success(.make(code: "SITE_BLOCKED"))]
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .siteBlocked)
        XCTAssertEqual(store.records.first?.state, "needsApp")
        XCTAssertFalse(coordinator.claimsSuccess)
        coordinator.noteTimerElapsed()
        XCTAssertEqual(coordinator.completionCount, 0)
    }

    func testAmbiguousSubmitPollsThenReplaysOnce() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make())
        service.submitResults = [.failure(.timedOut), .success("again")]
        service.statuses = [.failure(.notFound), .success(.make(status: "pending"))]
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            maxPolls: 1,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.submitCount, 2)
        XCTAssertEqual(service.submitBodies.map(\.clientRequestId).count, 2)
        XCTAssertEqual(
            service.submitBodies[0].clientRequestId,
            service.submitBodies[1].clientRequestId
        )
        XCTAssertEqual(coordinator.state, .started)
    }

    func testAmbiguousSubmitDoesNotReplayWhenTheJobExists() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make())
        service.submitResults = [.failure(.timedOut)]
        service.statuses = [
            .success(.make(status: "pending", progress: "reading_page")),
            .success(.make(status: "pending", progress: "reading_page")),
        ]
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            maxPolls: 1,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.submitCount, 1)
        XCTAssertEqual(coordinator.state, .progress(ShareImportCopy.readingPage))
    }

    func testProgressThenConfirmedSaysAddedToGalley() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make())
        service.statuses = [
            .success(.make(progress: "reading_page")),
            .success(.make(progress: "listening_to_video")),
            .success(.make(progress: "extracting")),
            .success(.make(status: "completed", mealName: "Soup")),
        ]
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://youtu.be/abc")!,
            userText: "weeknight",
            service: service,
            store: store,
            maxPolls: 4,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .addedToGalley)
        XCTAssertEqual(service.confirmCount, 0)
        XCTAssertTrue(coordinator.trace.contains("ui:\(ShareImportCopy.readingPage)"))
        XCTAssertTrue(coordinator.trace.contains("ui:\(ShareImportCopy.listeningToVideo)"))
        XCTAssertTrue(coordinator.trace.contains("ui:\(ShareImportCopy.buildingRecipe)"))
        XCTAssertEqual(store.records.first?.acknowledged, true)
    }

    func testLogoutEpochLeavesTheRecordUnowned() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make())
        service.onAccess = { store.epoch += 1 }
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .signedOut)
        XCTAssertEqual(coordinator.submitCount, 0)
        XCTAssertNil(store.records.first?.ownerUserId)
    }

    func testResumeDecisions() {
        let saved = ShareImportRecord(
            id: "1",
            clientRequestId: "11111111-1111-1111-1111-111111111111",
            url: "https://example.com/secret",
            userText: nil,
            savedAt: 0,
            state: "saved"
        )
        XCTAssertEqual(
            ShareImportResume.decide(
                record: saved,
                userId: "user-1",
                organizationId: "org-1",
                memberships: ["org-1"],
                currentEpoch: 0
            ),
            .continueInKitchen(clientRequestId: saved.clientRequestId)
        )
        var other = saved
        other.ownerUserId = "user-2"
        other.state = "processing"
        other.requestId = other.clientRequestId
        XCTAssertEqual(
            ShareImportResume.decide(
                record: other,
                userId: "user-1",
                organizationId: "org-1",
                memberships: ["org-1"],
                currentEpoch: 0
            ),
            .discard
        )
        var kitchen = saved
        kitchen.ownerUserId = "user-1"
        kitchen.organizationId = "org-2"
        kitchen.organizationName = "Crew"
        kitchen.state = "processing"
        kitchen.requestId = kitchen.clientRequestId
        XCTAssertEqual(
            ShareImportResume.decide(
                record: kitchen,
                userId: "user-1",
                organizationId: "org-1",
                memberships: ["org-1", "org-2"],
                currentEpoch: 0
            ),
            .switchKitchen("Crew")
        )
        var mine = kitchen
        mine.organizationId = "org-1"
        XCTAssertEqual(
            ShareImportResume.decide(
                record: mine,
                userId: "user-1",
                organizationId: "org-1",
                memberships: ["org-1"],
                currentEpoch: 0
            ),
            .resume(clientRequestId: mine.clientRequestId, allowDeviceCapture: false)
        )
        var blocked = mine
        blocked.state = "needsApp"
        blocked.sessionEpoch = 0
        XCTAssertEqual(
            ShareImportResume.decide(
                record: blocked,
                userId: "user-1",
                organizationId: "org-1",
                memberships: ["org-1"],
                currentEpoch: 0
            ),
            .resume(clientRequestId: blocked.clientRequestId, allowDeviceCapture: true)
        )
        XCTAssertFalse(ShareImportCopy.switchKitchen("Crew").localizedCaseInsensitiveContains("share again"))
        XCTAssertTrue(ShareImportCopy.switchKitchen("Crew").contains("Crew"))
        XCTAssertEqual(
            ShareImportCopy.preparing(host: "example.com", cost: 3),
            "Preparing import from example.com. This import uses 3 credits."
        )
        var stale = saved
        stale.sessionEpoch = 4
        XCTAssertEqual(
            ShareImportResume.decide(
                record: stale,
                userId: "user-2",
                organizationId: "org-2",
                memberships: ["org-2"],
                currentEpoch: 5
            ),
            .discard
        )
        mine.sessionEpoch = 4
        XCTAssertEqual(
            ShareImportResume.decide(
                record: mine,
                userId: "user-1",
                organizationId: "org-1",
                memberships: ["org-1"],
                currentEpoch: 5
            ),
            .discard
        )
    }

    func testConfirmRechecksTheSessionEpoch() async {
        let store = MemoryShareImportStore()
        let service = ScriptedShareImportService(session: .make())
        service.statuses = [
            .success(.make(status: "completed", needsVerification: true))
        ]
        service.onConfirm = { store.epoch += 1 }
        let coordinator = ShareImportCoordinator()
        await coordinator.begin(
            url: URL(string: "https://example.com/soup")!,
            userText: nil,
            service: service,
            store: store,
            sleep: { _ in }
        )
        XCTAssertEqual(coordinator.state, .readyToAdd)
        await coordinator.addToGalley()
        XCTAssertEqual(service.confirmCount, 1)
        XCTAssertEqual(coordinator.state, .signedOut)
        XCTAssertNotEqual(store.records.first?.state, "confirmed")
        XCTAssertNotEqual(store.records.first?.acknowledged, true)
    }

    func testRefreshHoldsTheAuthLockAndFailsClosed() async {
        let lock = RecordingLock()
        let credentials = MemoryCredentials(token: "old")
        var sawHeld = false
        let auth = ShareImportAuth(
            lock: lock,
            credentials: credentials,
            refresh: { token in
                sawHeld = lock.held
                XCTAssertEqual(token, "old")
                return ShareImportTokenPair(accessToken: "access", refreshToken: "new")
            }
        )
        let access = try? await auth.accessToken()
        XCTAssertEqual(access, "access")
        XCTAssertTrue(sawHeld)
        XCTAssertFalse(lock.held)
        XCTAssertEqual(credentials.token, "new")

        credentials.token = "old"
        credentials.acceptSave = false
        let rejected = ShareImportAuth(
            lock: RecordingLock(),
            credentials: credentials,
            refresh: { _ in
                ShareImportTokenPair(accessToken: "access", refreshToken: "rotated")
            }
        )
        do {
            _ = try await rejected.accessToken()
            XCTFail("missing keychain write must fail")
        } catch ShareImportServiceError.unauthorized {
            XCTAssertEqual(credentials.token, "old")
        } catch {
            XCTFail("unexpected \(error)")
        }

        credentials.acceptSave = true
        let closed = RecordingLock()
        closed.fail = true
        var refreshed = false
        let locked = ShareImportAuth(
            lock: closed,
            credentials: credentials,
            refresh: { _ in
                refreshed = true
                return ShareImportTokenPair(accessToken: "access", refreshToken: "new")
            }
        )
        do {
            _ = try await locked.accessToken()
            XCTFail("lock failure must not refresh")
        } catch {
            XCTAssertFalse(refreshed)
            XCTAssertEqual(credentials.token, "old")
        }
        XCTAssertFalse(ShareImportKeychainPolicy.allowsMissingEntitlement)
        XCTAssertFalse(ShareImportKeychainPolicy.accepted(-34018))
        XCTAssertTrue(ShareImportKeychainPolicy.accepted(errSecSuccess))
    }
}

final class ShareImportQueueTests: XCTestCase {
    func testFullQueueFailsClosedAndDoesNotOverwrite() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let suite = "share-import-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = SharedImportStore(directory: directory, defaults: defaults)
        for index in 0..<10 {
            try store.insert(Self.record(index))
        }
        XCTAssertThrowsError(try store.insert(Self.record(10))) { error in
            XCTAssertEqual(error as? SharedImportStoreError, .full)
        }
        XCTAssertEqual(store.record(id: "0")?.url, "https://example.com/0")
        XCTAssertNil(store.record(id: "10"))
        XCTAssertFalse(SharedImportStore.flagEnabled(defaults))
    }

    func testLockFailureDoesNotWrite() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = SharedImportStore(directory: directory, defaults: nil)
        store.failLock = true
        XCTAssertThrowsError(try store.insert(ShareImportQueueTests.record(0)))
        XCTAssertNil(store.record(id: "0"))
    }

    func testLateInsertAfterLogoutDoesNotSurvive() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let suite = "share-import-logout-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = SharedImportStore(directory: directory, defaults: defaults)
        let captured = store.epoch
        store.advanceEpoch()
        store.clearAll()
        var late = Self.record(0)
        late.sessionEpoch = captured
        late.ownerUserId = nil
        late.url = "https://example.com/private-recipe"
        try store.insert(late)
        XCTAssertNil(store.record(id: late.id))
        XCTAssertNil(store.peekOldest())
        XCTAssertEqual(
            ShareImportResume.decide(
                record: late,
                userId: "user-2",
                organizationId: "org-2",
                memberships: ["org-2"],
                currentEpoch: store.epoch
            ),
            .discard
        )

        var signedOut = Self.record(1)
        signedOut.sessionEpoch = store.epoch
        signedOut.ownerUserId = nil
        signedOut.url = "https://example.com/signed-out"
        try store.insert(signedOut)
        store.dropForeignRows(keepUnownedCurrentSession: false)
        XCTAssertNil(store.record(id: signedOut.id))
        XCTAssertNil(store.peekOldest())

        var current = Self.record(2)
        current.sessionEpoch = store.epoch
        current.ownerUserId = nil
        current.url = "https://example.com/this-session"
        try store.insert(current)
        store.dropForeignRows(keepUnownedCurrentSession: true)
        XCTAssertEqual(store.peekOldest()?.url, "https://example.com/this-session")
        XCTAssertEqual(
            ShareImportResume.decide(
                record: current,
                userId: "user-1",
                organizationId: "org-1",
                memberships: ["org-1"],
                currentEpoch: store.epoch
            ),
            .continueInKitchen(clientRequestId: current.clientRequestId)
        )
        store.advanceEpoch()
        store.dropForeignRows(keepUnownedCurrentSession: true)
        XCTAssertNil(store.peekOldest())
        XCTAssertEqual(
            ShareImportResume.decide(
                record: current,
                userId: "user-2",
                organizationId: "org-2",
                memberships: ["org-2"],
                currentEpoch: store.epoch
            ),
            .discard
        )
    }

    func testClearAndPeekStayInsideTheLock() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = SharedImportStore(directory: directory, defaults: nil)
        try store.insert(Self.record(0))
        store.failLock = true
        store.clearAll()
        XCTAssertEqual(store.record(id: "0")?.url, "https://example.com/0")
        XCTAssertNil(store.peekOldest())
        store.failLock = false
        XCTAssertEqual(store.peekOldest()?.id, "0")
        store.clearAll()
        XCTAssertNil(store.peekOldest())
        XCTAssertNil(store.record(id: "0"))
    }

    func testStaleEpochUpdateDropsTheRow() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let suite = "share-import-epoch-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = SharedImportStore(directory: directory, defaults: defaults)
        var record = Self.record(0)
        record.ownerUserId = "user-1"
        record.sessionEpoch = store.epoch
        try store.insert(record)
        store.advanceEpoch()
        record.state = "processing"
        try store.update(record)
        XCTAssertNil(store.record(id: "0"))
        XCTAssertNil(store.peekOldest())
    }

    func testExpiredUnsubmittedRecordIsDropped() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = SharedImportStore(directory: directory, defaults: nil)
        var stale = ShareImportQueueTests.record(0)
        stale.savedAt = Date().timeIntervalSince1970 - (25 * 60 * 60)
        try store.insert(stale)
        XCTAssertNil(store.peekOldest())
    }

    private static func record(_ index: Int) -> ShareImportRecord {
        ShareImportRecord(
            id: "\(index)",
            clientRequestId: "11111111-1111-1111-1111-111111111111",
            url: "https://example.com/\(index)",
            userText: nil,
            savedAt: Date().timeIntervalSince1970,
            state: "saved"
        )
    }
}

private final class MemoryShareImportStore: ShareImportStoring {
    var epoch = 0
    var records: [ShareImportRecord] = []

    func insert(_ record: ShareImportRecord) throws {
        if records.count >= SharedImportStore.maxRecords {
            throw SharedImportStoreError.full
        }
        records.append(record)
    }

    func update(_ record: ShareImportRecord) throws {
        if let index = records.firstIndex(where: { $0.id == record.id }) {
            records[index] = record
        } else {
            records.append(record)
        }
    }

    func record(id: String) -> ShareImportRecord? {
        records.first { $0.id == id }
    }

    func peekOldest(now: Date) -> ShareImportRecord? {
        records.first { !$0.acknowledged }
    }

    func acknowledge(id: String) {
        guard let index = records.firstIndex(where: { $0.id == id }) else { return }
        records[index].acknowledged = true
    }

    func clearAll() {
        records.removeAll()
    }
}

private final class ScriptedShareImportService: ShareImportServicing {
    var session: ShareImportSessionSnapshot
    var accessError: ShareImportServiceError?
    var submitError: ShareImportServiceError?
    var submitResults: [Result<String, ShareImportServiceError>] = []
    var statuses: [Result<ShareImportJobSnapshot, ShareImportServiceError>] = []
    var submitBodies: [ShareImportSubmitBody] = []
    var grantCount = 0
    var confirmCount = 0
    var onAccess: () -> Void = {}

    init(
        session: ShareImportSessionSnapshot,
        accessError: ShareImportServiceError? = nil,
        submitError: ShareImportServiceError? = nil
    ) {
        self.session = session
        self.accessError = accessError
        self.submitError = submitError
    }

    func accessToken() async throws -> String {
        onAccess()
        if let accessError { throw accessError }
        return "token"
    }

    func loadSession() async throws -> ShareImportSessionSnapshot {
        session
    }

    func grantConsent() async throws {
        grantCount += 1
    }

    func submit(_ body: ShareImportSubmitBody) async throws -> String {
        submitBodies.append(body)
        if !submitResults.isEmpty {
            return try submitResults.removeFirst().get()
        }
        if let submitError { throw submitError }
        return body.clientRequestId
    }

    func status(_ requestId: String) async throws -> ShareImportJobSnapshot {
        if !statuses.isEmpty {
            return try statuses.removeFirst().get()
        }
        return .make(status: "pending")
    }

    var onConfirm: () -> Void = {}

    func confirm(_ requestId: String) async throws {
        confirmCount += 1
        onConfirm()
    }
}

private extension ShareImportSessionSnapshot {
    static func make(
        hasConsent: Bool = true,
        web: Bool = true,
        social: Bool = true,
        share: Bool = true,
        credits: Int = 9,
        cost: Int = 3
    ) -> ShareImportSessionSnapshot {
        ShareImportSessionSnapshot(
            userId: "user-1",
            organizationId: "org-1",
            organizationName: "Kitchen",
            membershipIds: ["org-1"],
            credits: credits,
            importCost: cost,
            hasConsent: hasConsent,
            shareExtensionImport: share,
            aiImportWeb: web,
            aiImportSocial: social
        )
    }
}

private extension ShareImportJobSnapshot {
    static func make(
        status: String = "pending",
        progress: String? = nil,
        code: String? = nil,
        error: String? = nil,
        mealName: String? = nil,
        needsVerification: Bool = false
    ) -> ShareImportJobSnapshot {
        ShareImportJobSnapshot(
            status: status,
            progress: progress,
            code: code,
            error: error,
            existingMealName: nil,
            mealName: mealName,
            needsVerification: needsVerification
        )
    }
}

private final class RecordingLock: ShareImportLocking {
    var held = false
    var fail = false

    func perform<T>(_ work: () async throws -> T) async throws -> T {
        if fail { throw ShareImportServiceError.unauthorized }
        held = true
        defer { held = false }
        return try await work()
    }
}

private final class MemoryCredentials: ShareImportCredentialReading {
    var token: String?
    var acceptSave = true

    init(token: String?) {
        self.token = token
    }

    func refreshToken() -> String? { token }

    func saveRefresh(_ token: String) -> Bool {
        guard acceptSave else { return false }
        self.token = token
        return true
    }
}
