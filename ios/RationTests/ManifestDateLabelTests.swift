import XCTest
@testable import Ration

final class ManifestDateLabelTests: XCTestCase {
    func testOneDayUsesFullDate() {
        XCTAssertEqual(
            ManifestDateHelpers.formatRange(start: "2026-11-13", end: "2026-11-13"),
            "Nov 13, 2026"
        )
    }

    func testSameMonthKeepsTheExistingRange() {
        XCTAssertEqual(
            ManifestDateHelpers.formatRange(start: "2026-11-13", end: "2026-11-15"),
            "Nov 13–15, 2026"
        )
    }
}
