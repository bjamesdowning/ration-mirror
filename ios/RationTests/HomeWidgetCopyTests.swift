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
        XCTAssertEqual(HomeWidgetCopy.macroLine(remaining: 82), "82 g left")
        XCTAssertEqual(HomeWidgetCopy.macroLine(remaining: -12), "12 g over")
        XCTAssertEqual(HomeWidgetCopy.eatDetail(quantity: 6, unit: "slice", step: 1), "6 slices · take 1")
        XCTAssertEqual(HomeWidgetCopy.eatDetail(quantity: 0, unit: "slice", step: 1), "1 slice")
        XCTAssertEqual(HomeWidgetCopy.slotLabel("snack"), "Snack")
        XCTAssertEqual(HomeWidgetCopy.taggedEmpty(name: "Snack"), "Nothing tagged Snack")
    }

    func testSnapshotDecodesWithoutKcal() throws {
        let json = """
        {"supply":{"uncheckedCount":1,"items":[{"id":"a","name":"Milk"}]},"ate":{"available":false,"foods":[],"tagChoices":[{"slug":"snack","name":"Snack"}]},"today":{"status":"clear","title":null,"slotType":null,"meals":[],"uncheckedSupplyCount":1,"remainingKcal":null,"goalKcal":null,"protein":null,"carbs":null,"fat":null}}
        """.data(using: .utf8)!
        let snapshot = try JSONDecoder().decode(HomeWidgetSnapshot.self, from: json)
        XCTAssertEqual(snapshot.supply.items.first?.name, "Milk")
        XCTAssertNil(snapshot.today.remainingKcal)
        XCTAssertNil(snapshot.today.protein)
        XCTAssertEqual(snapshot.ate.tagChoices.first?.slug, "snack")
        XCTAssertFalse(snapshot.ate.available)
    }

    func testAPIBaseAllowsHttpsAndLocalhostOnly() {
        XCTAssertTrue(WidgetAPIBase.allows(URL(string: "https://ration.mayutic.com/api/mobile/v1")!))
        XCTAssertTrue(WidgetAPIBase.allows(URL(string: "http://localhost:5173/api/mobile/v1")!))
        XCTAssertFalse(WidgetAPIBase.allows(URL(string: "http://evil.example/api")!))
    }
}
