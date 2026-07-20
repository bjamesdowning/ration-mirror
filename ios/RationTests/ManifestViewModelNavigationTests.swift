import XCTest
@testable import Ration

@MainActor
final class ManifestViewModelNavigationTests: XCTestCase {
    func testPrepareForLoadResetsAnchorOnlyOnOrganizationChange() {
        let model = ManifestViewModel()
        model.configureFromSettings(calendarSpan: 7, weekStartPref: "sunday")
        model.applyInitialAnchorIfNeeded()
        let initialWeek = model.rangeStart
        let previousWeek = ManifestDateHelpers.addDays(initialWeek, days: -7)
        model.rangeStart = previousWeek
        model.selectedDay = previousWeek

        model.prepareForLoad(organizationId: "org-a", calendarSpan: 7, weekStartPref: "sunday")
        XCTAssertEqual(model.rangeStart, previousWeek, "Same-org reload must keep the viewed week")
        XCTAssertEqual(model.lastOrganizationId, "org-a")

        model.prepareForLoad(organizationId: "org-a", calendarSpan: 7, weekStartPref: "sunday")
        XCTAssertEqual(model.rangeStart, previousWeek, "Quiet revalidate must not reset the week")

        model.prepareForLoad(organizationId: "org-b", calendarSpan: 7, weekStartPref: "sunday")
        XCTAssertEqual(
            model.rangeStart,
            ManifestDateHelpers.initialRangeStart(calendarSpan: 7, weekStartPref: "sunday"),
            "Org switch must re-anchor to today"
        )
        XCTAssertEqual(model.lastOrganizationId, "org-b")
    }

    func testOptimisticRangeStartUpdatesBeforeFetchCompletes() async {
        let model = ManifestViewModel()
        model.configureFromSettings(calendarSpan: 7, weekStartPref: "sunday")
        model.applyInitialAnchorIfNeeded()
        let week0 = model.rangeStart
        let weekPrev = ManifestDateHelpers.normalizedNavigationStart(
            ManifestDateHelpers.addDays(week0, days: -7),
            calendarSpan: 7,
            weekStartPref: "sunday"
        )
        let weekPrevEnd = ManifestDateHelpers.addDays(weekPrev, days: 6)

        let gate = AsyncGate()
        model.fetchManifestForTesting = { start, end in
            XCTAssertEqual(start, weekPrev)
            XCTAssertEqual(end, weekPrevEnd)
            await gate.wait()
            return Self.manifest(start: start, end: end)
        }

        let api = RationAPI(client: APIClient(auth: AuthManager()))
        let snapshots = SnapshotStore()
        let organizationId = "org-nav-\(UUID().uuidString)"

        model.requestNavigateWeek(
            to: weekPrev,
            api: api,
            snapshots: snapshots,
            online: true,
            organizationId: organizationId
        )

        XCTAssertEqual(model.rangeStart, weekPrev)
        XCTAssertTrue(model.isNavigatingWeek)
        XCTAssertNil(model.manifest)

        await gate.open()
        await model.waitForNavigationForTesting()

        XCTAssertEqual(model.rangeStart, weekPrev)
        XCTAssertEqual(model.manifest?.startDate, weekPrev)
        XCTAssertFalse(model.isNavigatingWeek)
    }

    func testStaleNavigationResponseIsDiscarded() async throws {
        let model = ManifestViewModel()
        model.configureFromSettings(calendarSpan: 7, weekStartPref: "sunday")
        model.applyInitialAnchorIfNeeded()
        let week0 = model.rangeStart
        let weekPrev = ManifestDateHelpers.normalizedNavigationStart(
            ManifestDateHelpers.addDays(week0, days: -7),
            calendarSpan: 7,
            weekStartPref: "sunday"
        )
        let weekNext = ManifestDateHelpers.normalizedNavigationStart(
            ManifestDateHelpers.addDays(week0, days: 7),
            calendarSpan: 7,
            weekStartPref: "sunday"
        )

        let slowGate = AsyncGate()
        model.fetchManifestForTesting = { start, end in
            if start == weekPrev {
                await slowGate.wait()
            }
            return Self.manifest(start: start, end: end)
        }

        let api = RationAPI(client: APIClient(auth: AuthManager()))
        let snapshots = SnapshotStore()
        let organizationId = "org-stale-\(UUID().uuidString)"

        model.requestNavigateWeek(
            to: weekPrev,
            api: api,
            snapshots: snapshots,
            online: true,
            organizationId: organizationId
        )
        XCTAssertEqual(model.rangeStart, weekPrev)

        model.requestNavigateWeek(
            to: weekNext,
            api: api,
            snapshots: snapshots,
            online: true,
            organizationId: organizationId
        )
        XCTAssertEqual(model.rangeStart, weekNext)

        // Newer navigation should finish first; then release the stale fetch.
        await model.waitForNavigationForTesting()
        XCTAssertEqual(model.manifest?.startDate, weekNext)

        await slowGate.open()
        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(model.rangeStart, weekNext)
        XCTAssertEqual(model.manifest?.startDate, weekNext)
        XCTAssertFalse(model.isNavigatingWeek)

        let cached = await snapshots.load(
            ManifestResponse.self,
            domain: SnapshotDomain.manifest,
            organizationId: organizationId
        )
        XCTAssertEqual(cached?.payload.startDate, weekNext)
    }

    func testOfflineNavigationKeepsOptimisticWeekWithoutMatchingCache() async {
        let model = ManifestViewModel()
        model.configureFromSettings(calendarSpan: 7, weekStartPref: "sunday")
        model.applyInitialAnchorIfNeeded()
        let week0 = model.rangeStart
        let weekPrev = ManifestDateHelpers.normalizedNavigationStart(
            ManifestDateHelpers.addDays(week0, days: -7),
            calendarSpan: 7,
            weekStartPref: "sunday"
        )

        let organizationId = "org-offline-\(UUID().uuidString)"
        let snapshots = SnapshotStore()
        await snapshots.save(
            Self.manifest(start: week0, end: ManifestDateHelpers.addDays(week0, days: 6)),
            domain: SnapshotDomain.manifest,
            organizationId: organizationId
        )

        let api = RationAPI(client: APIClient(auth: AuthManager()))
        await model.navigateWeek(
            to: weekPrev,
            api: api,
            snapshots: snapshots,
            online: false,
            organizationId: organizationId
        )

        XCTAssertEqual(model.rangeStart, weekPrev)
        XCTAssertEqual(model.offlineBannerMessage, "Offline — no cached manifest data for this week")
    }

    private static func manifest(start: String, end: String) -> ManifestResponse {
        ManifestResponse(
            plan: MealPlanSummary(id: "plan-1", name: "Plan"),
            startDate: start,
            endDate: end,
            entries: [],
            supplyDayInclusion: nil
        )
    }
}

/// One-shot gate so tests can release a suspended fetch.
private actor AsyncGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { continuation in
            waiters.append(continuation)
        }
    }

    func open() {
        isOpen = true
        let pending = waiters
        waiters.removeAll()
        for waiter in pending {
            waiter.resume()
        }
    }
}
