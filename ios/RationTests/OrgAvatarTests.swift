import XCTest
@testable import Ration

final class OrgAvatarTests: XCTestCase {
    func testInitialsFromTwoWordName() {
        XCTAssertEqual(OrgAvatarHelpers.initials(for: "Orbital Kitchen"), "OK")
    }

    func testInitialsFromSingleWord() {
        XCTAssertEqual(OrgAvatarHelpers.initials(for: "Ration"), "RA")
    }

    func testInitialsFromEmptyName() {
        XCTAssertEqual(OrgAvatarHelpers.initials(for: "   "), "?")
    }

    func testColorsAreDeterministicForOrgId() {
        let first = OrgAvatarHelpers.colors(for: "org_abc123")
        let second = OrgAvatarHelpers.colors(for: "org_abc123")
        XCTAssertEqual(first.bg, second.bg)
        XCTAssertEqual(first.fg, second.fg)
    }

    func testDifferentOrgIdsMayDifferInPalette() {
        let ids = (0..<20).map { "org_\($0)" }
        let colors = Set(ids.map { OrgAvatarHelpers.colors(for: $0).bg.description })
        XCTAssertGreaterThan(colors.count, 1)
    }
}
