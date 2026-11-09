import XCTest
@testable import Ration

final class DiaryLayoutTests: XCTestCase {
    private struct Row {
        let id: String
        let slot: String?
        let time: Date
    }

    private func date(_ hour: Int) -> Date {
        Date(timeIntervalSince1970: TimeInterval(hour * 3600))
    }

    func testNullSlotStaysInOtherAndTimeOrder() {
        let rows = [
            Row(id: "late", slot: nil, time: date(18)),
            Row(id: "breakfast", slot: "breakfast", time: date(8)),
            Row(id: "early", slot: nil, time: date(12)),
            Row(id: "same", slot: "mystery", time: date(12)),
        ]
        let groups = DiaryLayout.present(
            rows: rows,
            controlVisible: true,
            layout: .slots,
            id: { $0.id },
            slot: { $0.slot },
            time: { $0.time }
        )
        XCTAssertEqual(groups.map(\.label), ["Breakfast", "Other"])
        XCTAssertEqual(groups.first { $0.id == "other" }?.rows.map(\.id), ["early", "same", "late"])
    }

    func testFlagOffLeavesTheOriginalOrder() {
        let rows = [
            Row(id: "z", slot: nil, time: date(20)),
            Row(id: "a", slot: "snack", time: date(8)),
        ]
        let groups = DiaryLayout.present(
            rows: rows,
            controlVisible: false,
            layout: .slots,
            id: { $0.id },
            slot: { $0.slot },
            time: { $0.time }
        )
        XCTAssertEqual(groups.map(\.id), ["all"])
        XCTAssertNil(groups[0].label)
        XCTAssertEqual(groups[0].rows.map(\.id), ["z", "a"])
    }

    func testControlStaysHiddenBelowIOS16() {
        XCTAssertFalse(DiaryLayout.controlVisible(fastLogEnabled: false, appVersion: "1.6.0"))
        XCTAssertFalse(DiaryLayout.controlVisible(fastLogEnabled: true, appVersion: "1.5.17"))
        XCTAssertTrue(DiaryLayout.controlVisible(fastLogEnabled: true, appVersion: "1.6.0"))
    }
}
