import XCTest
@testable import Ration

final class KitchenClockTests: XCTestCase {
    override func tearDown() {
        KitchenClock.set(identifier: nil)
        super.tearDown()
    }

    func testMissingZoneLeavesManifestOnTheDeviceClock() {
        KitchenClock.set(identifier: nil)
        XCTAssertEqual(ManifestDateHelpers.todayISO(), isoNow(timeZone: .current))
        XCTAssertNil(KitchenClock.zonedTodayISO())
    }

    func testInvalidZoneDoesNotReplaceTheDeviceClock() {
        KitchenClock.set(identifier: "PST")
        XCTAssertNil(KitchenClock.zonedTodayISO())
        XCTAssertEqual(ManifestDateHelpers.todayISO(), isoNow(timeZone: .current))
    }

    func testDublinCrossesLocalMidnight() {
        KitchenClock.set(identifier: "Europe/Dublin")
        let before = date("2026-07-13T22:30:00Z")
        let after = date("2026-07-13T23:30:00Z")
        XCTAssertEqual(KitchenClock.zonedTodayISO(now: before), "2026-07-13")
        XCTAssertEqual(KitchenClock.zonedTodayISO(now: after), "2026-07-14")
    }

    func testPacificCrossesLocalMidnight() {
        KitchenClock.set(identifier: "America/Los_Angeles")
        XCTAssertEqual(
            KitchenClock.zonedTodayISO(now: date("2026-07-14T06:30:00Z")),
            "2026-07-13"
        )
        XCTAssertEqual(
            KitchenClock.zonedTodayISO(now: date("2026-07-14T07:30:00Z")),
            "2026-07-14"
        )
    }

    func testSpringForwardKeepsTheCalendarDay() {
        KitchenClock.set(identifier: "America/Los_Angeles")
        XCTAssertEqual(
            KitchenClock.zonedTodayISO(now: date("2026-03-08T07:59:00Z")),
            "2026-03-07"
        )
        XCTAssertEqual(
            KitchenClock.zonedTodayISO(now: date("2026-03-08T08:00:00Z")),
            "2026-03-08"
        )
        XCTAssertEqual(
            KitchenClock.zonedTodayISO(now: date("2026-03-08T10:30:00Z")),
            "2026-03-08"
        )
    }

    func testFallBackKeepsTheCalendarDay() {
        KitchenClock.set(identifier: "America/Los_Angeles")
        XCTAssertEqual(
            KitchenClock.zonedTodayISO(now: date("2026-11-01T06:59:00Z")),
            "2026-10-31"
        )
        XCTAssertEqual(
            KitchenClock.zonedTodayISO(now: date("2026-11-01T07:00:00Z")),
            "2026-11-01"
        )
        XCTAssertEqual(
            KitchenClock.zonedTodayISO(now: date("2026-11-01T09:30:00Z")),
            "2026-11-01"
        )
    }

    func testStoredZoneWinsOverALaterDeviceZone() {
        XCTAssertEqual(
            KitchenTimeZoneSync.resolvedIdentifier(
                stored: "Europe/Dublin",
                device: "America/Los_Angeles",
                canCapture: true
            ),
            "Europe/Dublin"
        )
        XCTAssertEqual(
            KitchenTimeZoneSync.resolvedIdentifier(
                stored: nil,
                device: "America/Los_Angeles",
                canCapture: true
            ),
            "America/Los_Angeles"
        )
        XCTAssertNil(
            KitchenTimeZoneSync.resolvedIdentifier(
                stored: nil,
                device: "America/Los_Angeles",
                canCapture: false
            )
        )
        XCTAssertNil(
            KitchenTimeZoneSync.resolvedIdentifier(
                stored: "PST",
                device: "NotAZone",
                canCapture: true
            )
        )
    }

    private func date(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }

    private func isoNow(timeZone: TimeZone) -> String {
        KitchenClock.isoDate(Date(), timeZone: timeZone)
    }
}
