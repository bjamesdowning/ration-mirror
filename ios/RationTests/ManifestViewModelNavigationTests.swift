import XCTest
@testable import Ration

@MainActor
final class ManifestViewModelNavigationTests: XCTestCase {
    /// Add-entry sheet must use `selectedDay` (focused day), not `manifest.startDate` (week range echo).
    func testSelectedDayIsAddEntryDefaultNotWeekStartDate() async {
        let model = ManifestViewModel()
        model.configureFromSettings(calendarSpan: 7, weekStartPref: "sunday")
        model.applyInitialAnchorIfNeeded()
        let weekStart = model.rangeStart
        let midWeek = ManifestDateHelpers.addDays(weekStart, days: 3)

        model.fetchManifestForTesting = { start, end in
            Self.manifest(start: start, end: end)
        }
        let api = RationAPI(client: APIClient(auth: AuthManager()))
        let snapshots = SnapshotStore()
        let nutrition = NutritionStore(snapshots: snapshots)
        let organizationId = "org-add-date-\(UUID().uuidString)"
        let userId = "user-add-date"

        await model.navigateWeek(
            to: weekStart,
            api: api,
            snapshots: snapshots,
            online: true,
            organizationId: organizationId,
            userId: userId,
            nutrition: nutrition
        )
        model.selectedDay = midWeek

        XCTAssertEqual(model.manifest?.startDate, weekStart)
        XCTAssertEqual(model.selectedDay, midWeek)
        XCTAssertNotEqual(
            model.selectedDay,
            model.manifest?.startDate,
            "Add sheet defaultDate must be selectedDay, not range startDate"
        )
    }

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

    func testColdLoadDecodeFailureSurfacesAnErrorInsteadOfEmptyManifest() async {
        let model = ManifestViewModel()
        model.fetchManifestForTesting = { _, _ in
            throw APIError.decoding("fractional Hub widget order")
        }
        let snapshots = SnapshotStore()
        let nutrition = NutritionStore(snapshots: snapshots)
        let api = RationAPI(client: APIClient(auth: AuthManager()))

        await model.load(
            api: api,
            snapshots: snapshots,
            online: true,
            organizationId: "org-decode-\(UUID().uuidString)",
            userId: "user-decode",
            nutrition: nutrition
        )

        XCTAssertNil(model.manifest)
        XCTAssertEqual(model.errorMessage, "Unexpected response from server.")
    }

    func testCancelledColdLoadSurfacesRetryMessageInsteadOfEmptyManifest() async {
        let model = ManifestViewModel()
        model.fetchManifestForTesting = { _, _ in
            throw CancellationError()
        }
        let snapshots = SnapshotStore()
        let nutrition = NutritionStore(snapshots: snapshots)
        let api = RationAPI(client: APIClient(auth: AuthManager()))

        await model.load(
            api: api,
            snapshots: snapshots,
            online: true,
            organizationId: "org-cancel-\(UUID().uuidString)",
            userId: "user-cancel",
            nutrition: nutrition
        )

        XCTAssertNil(model.manifest)
        XCTAssertEqual(
            model.errorMessage,
            "Couldn't load Manifest. Pull to refresh or try again."
        )
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
        let nutrition = NutritionStore(snapshots: snapshots)
        let organizationId = "org-nav-\(UUID().uuidString)"
        let userId = "user-nav"

        model.requestNavigateWeek(
            to: weekPrev,
            api: api,
            snapshots: snapshots,
            online: true,
            organizationId: organizationId,
            userId: userId,
            nutrition: nutrition
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
        let nutrition = NutritionStore(snapshots: snapshots)
        let organizationId = "org-stale-\(UUID().uuidString)"
        let userId = "user-stale"

        model.requestNavigateWeek(
            to: weekPrev,
            api: api,
            snapshots: snapshots,
            online: true,
            organizationId: organizationId,
            userId: userId,
            nutrition: nutrition
        )
        XCTAssertEqual(model.rangeStart, weekPrev)

        model.requestNavigateWeek(
            to: weekNext,
            api: api,
            snapshots: snapshots,
            online: true,
            organizationId: organizationId,
            userId: userId,
            nutrition: nutrition
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
            scope: .userOrganization(userId: userId, organizationId: organizationId)
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
        let userId = "user-offline"
        let snapshots = SnapshotStore()
        let nutrition = NutritionStore(snapshots: snapshots)
        await snapshots.save(
            Self.manifest(start: week0, end: ManifestDateHelpers.addDays(week0, days: 6)),
            domain: SnapshotDomain.manifest,
            scope: .userOrganization(userId: userId, organizationId: organizationId)
        )

        let api = RationAPI(client: APIClient(auth: AuthManager()))
        await model.navigateWeek(
            to: weekPrev,
            api: api,
            snapshots: snapshots,
            online: false,
            organizationId: organizationId,
            userId: userId,
            nutrition: nutrition
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
