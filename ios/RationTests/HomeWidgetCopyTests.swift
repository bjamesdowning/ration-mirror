import XCTest
@testable import Ration

final class HomeWidgetCopyTests: XCTestCase {
    func testSupplyHeadline() {
        XCTAssertEqual(HomeWidgetCopy.supplyHeadline(uncheckedCount: 0), "Nothing to buy")
        XCTAssertEqual(HomeWidgetCopy.supplyHeadline(uncheckedCount: 1), "1 to buy")
        XCTAssertEqual(HomeWidgetCopy.supplyHeadline(uncheckedCount: 4), "4 to buy")
    }

    func testTodayTitleHidesEmptyAndFinishedDays() {
        XCTAssertEqual(HomeWidgetCopy.todayTitle(status: "clear", title: nil), "Nothing planned")
        XCTAssertEqual(HomeWidgetCopy.todayTitle(status: "done", title: nil), "All cooked")
        XCTAssertEqual(HomeWidgetCopy.todayTitle(status: "planned", title: "Soup"), "Soup")
        XCTAssertEqual(HomeWidgetCopy.todayTitle(status: "planned", title: "  "), "Meal planned")
    }

    func testEnergyLineOmitsMissingConsent() {
        XCTAssertNil(HomeWidgetCopy.energyLine(remainingKcal: nil))
        XCTAssertEqual(HomeWidgetCopy.energyLine(remainingKcal: 640), "640 kcal left")
        XCTAssertEqual(HomeWidgetCopy.energyLine(remainingKcal: -40), "40 kcal over")
    }

    func testSnapshotDecodesWithoutKcal() throws {
        let json = """
        {"supply":{"uncheckedCount":1,"items":[{"id":"a","name":"Milk"}]},"ate":{"available":false,"foods":[]},"today":{"status":"clear","title":null,"uncheckedSupplyCount":1,"remainingKcal":null,"goalKcal":null}}
        """.data(using: .utf8)!
        let snapshot = try JSONDecoder().decode(HomeWidgetSnapshot.self, from: json)
        XCTAssertEqual(snapshot.supply.items.first?.name, "Milk")
        XCTAssertNil(snapshot.today.remainingKcal)
        XCTAssertFalse(snapshot.ate.available)
    }

    func testAPIBaseAllowsHttpsAndLocalhostOnly() {
        XCTAssertTrue(WidgetAPIBase.allows(URL(string: "https://ration.mayutic.com/api/mobile/v1")!))
        XCTAssertTrue(WidgetAPIBase.allows(URL(string: "http://localhost:5173/api/mobile/v1")!))
        XCTAssertFalse(WidgetAPIBase.allows(URL(string: "http://evil.example/api")!))
    }
}
