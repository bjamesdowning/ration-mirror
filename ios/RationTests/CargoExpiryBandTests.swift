import XCTest
@testable import Ration

final class CargoExpiryBandTests: XCTestCase {
    private var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0)!
        return cal
    }

    private func date(_ y: Int, _ m: Int, _ d: Int) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d))!
    }

    func testGreenWhenMoreThanSevenDays() {
        let ref = date(2026, 7, 1)
        let expiry = date(2026, 7, 10)
        XCTAssertEqual(CargoExpiryBand.band(expiresAt: expiry, reference: ref), .green)
    }

    func testYellowBetweenThreeAndSevenDays() {
        let ref = date(2026, 7, 1)
        let expiry = date(2026, 7, 5)
        XCTAssertEqual(CargoExpiryBand.band(expiresAt: expiry, reference: ref), .yellow)
    }

    func testRedWithinTwoDays() {
        let ref = date(2026, 7, 1)
        let expiry = date(2026, 7, 2)
        XCTAssertEqual(CargoExpiryBand.band(expiresAt: expiry, reference: ref), .red)
    }

    func testExpiredWhenPastDate() {
        let ref = date(2026, 7, 5)
        let expiry = date(2026, 7, 1)
        XCTAssertEqual(CargoExpiryBand.band(expiresAt: expiry, reference: ref), .expired)
    }

    func testHiddenWithoutExpiry() {
        XCTAssertEqual(CargoExpiryBand.band(expiresAt: nil), .hidden)
    }
}
