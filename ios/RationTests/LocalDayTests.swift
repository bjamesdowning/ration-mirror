import XCTest
@testable import Ration

final class LocalDayTests: XCTestCase {
    func testAddDaysUsesCalendarDayArithmetic() {
        XCTAssertEqual(LocalDay.addDays("2026-03-08", days: 1), "2026-03-09")
        XCTAssertEqual(LocalDay.addDays("2026-02-28", days: 1), "2026-03-01")
        XCTAssertEqual(LocalDay.addDays("2026-08-09", days: -7), "2026-08-02")
    }

    func testIsoDatesInclusiveContiguousRange() {
        XCTAssertEqual(
            LocalDay.isoDates(from: "2026-08-01", to: "2026-08-03"),
            ["2026-08-01", "2026-08-02", "2026-08-03"]
        )
    }

    func testIsoDatesReturnsEmptyForReversedOrInvalidBounds() {
        XCTAssertEqual(LocalDay.isoDates(from: "2026-08-03", to: "2026-08-01"), [])
        XCTAssertEqual(LocalDay.isoDates(from: "not-a-date", to: "2026-08-01"), [])
    }

    func testContainsInclusiveBounds() {
        XCTAssertTrue(LocalDay.contains("2026-08-02", from: "2026-08-01", to: "2026-08-03"))
        XCTAssertTrue(LocalDay.contains("2026-08-01", from: "2026-08-01", to: "2026-08-03"))
        XCTAssertFalse(LocalDay.contains("2026-07-31", from: "2026-08-01", to: "2026-08-03"))
    }

    func testFingerprintIsOpaqueAndStable() {
        let a = SnapshotScope.fingerprint(userId: "user-1", organizationId: "org-1")
        let b = SnapshotScope.fingerprint(userId: "user-1", organizationId: "org-1")
        let c = SnapshotScope.fingerprint(userId: "user-2", organizationId: "org-1")
        XCTAssertEqual(a, b)
        XCTAssertNotEqual(a, c)
        XCTAssertFalse(a.contains("user-1"))
        XCTAssertEqual(a.count, 32)
    }
}
