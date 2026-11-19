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
        XCTAssertEqual(HomeWidgetCopy.macroLine(remaining: 109, goal: 151), "42 of 151 g")
        XCTAssertEqual(HomeWidgetCopy.macroLine(remaining: -12, goal: 50), "62 of 50 g")
        XCTAssertEqual(HomeWidgetCopy.absentEnergyLine, "No calorie goal")
        XCTAssertNil(HomeWidgetCopy.energyLine(remainingKcal: nil))
        XCTAssertEqual(HomeWidgetCopy.eatDetail(quantity: 6, unit: "slice", step: 1), "6 slices · take 1")
        XCTAssertEqual(HomeWidgetCopy.eatDetail(quantity: 0, unit: "slice", step: 1), "1 slice")
        XCTAssertEqual(HomeWidgetCopy.slotLabel("snack"), "Snack")
        XCTAssertEqual(HomeWidgetCopy.taggedEmpty(name: "Snack"), "Nothing tagged Snack")
    }

    func testSnapshotDecodesWithoutKcal() throws {
        let json = """
        {"supply":{"uncheckedCount":1,"items":[{"id":"a","name":"Milk"}]},"eat":{"available":false,"foods":[],"tagChoices":[{"slug":"snack","name":"Snack"}]},"today":{"status":"clear","title":null,"slotType":null,"meals":[],"uncheckedSupplyCount":1,"remainingKcal":null,"goalKcal":null,"protein":null,"carbs":null,"fat":null}}
        """.data(using: .utf8)!
        let snapshot = try JSONDecoder().decode(HomeWidgetSnapshot.self, from: json)
        XCTAssertEqual(snapshot.supply.items.first?.name, "Milk")
        XCTAssertNil(snapshot.today.remainingKcal)
        XCTAssertNil(snapshot.today.protein)
        XCTAssertEqual(snapshot.eat.tagChoices.first?.slug, "snack")
        XCTAssertFalse(snapshot.eat.available)
    }

    func testSnapshotWithoutFuelBitStaysOnQuickEat() throws {
        let json = """
        {"schema":2,"state":"ready","snapshot":null,"eatByTag":{},"fetchedAt":null,"tagFetchedAt":{},"statusLine":null,"inFlightCargoIds":[],"supplyHold":null,"eatHold":null}
        """.data(using: .utf8)!
        let cache = try JSONDecoder().decode(HomeWidgetCache.self, from: json)
        XCTAssertNil(cache.planFuelActions)
        XCTAssertEqual(WidgetEatRouting.route(planFuelActions: cache.planFuelActions), .quickEat)
    }

    func testFuelBitChoosesTheFuelRoute() throws {
        XCTAssertEqual(WidgetEatRouting.route(planFuelActions: false), .quickEat)
        XCTAssertEqual(WidgetEatRouting.route(planFuelActions: true), .addToFuel)
        let json = """
        {"schema":2,"state":"ready","snapshot":null,"eatByTag":{},"fetchedAt":null,"tagFetchedAt":{},"statusLine":null,"inFlightCargoIds":[],"supplyHold":null,"eatHold":null,"planFuelActions":true}
        """.data(using: .utf8)!
        let cache = try JSONDecoder().decode(HomeWidgetCache.self, from: json)
        XCTAssertEqual(WidgetEatRouting.route(planFuelActions: cache.planFuelActions), .addToFuel)
    }

    func testEatFaceBranchesOnTheFuelBit() {
        XCTAssertEqual(HomeWidgetCopy.eatWordmark(planFuelActions: nil), "EAT")
        XCTAssertEqual(HomeWidgetCopy.eatWordmark(planFuelActions: false), "EAT")
        XCTAssertEqual(HomeWidgetCopy.eatWordmark(planFuelActions: true), "FUEL")
        XCTAssertEqual(HomeWidgetCopy.eatSucceededWord(planFuelActions: false), "Eaten")
        XCTAssertEqual(HomeWidgetCopy.eatSucceededWord(planFuelActions: true), "Logged")
        XCTAssertEqual(HomeWidgetCopy.eatEmpty(planFuelActions: nil), "Nothing ready to eat")
        XCTAssertEqual(HomeWidgetCopy.eatEmpty(planFuelActions: true), "Nothing ready to log")
        XCTAssertEqual(HomeWidgetCopy.eatFallback(planFuelActions: false), "Open Cargo to eat")
        XCTAssertEqual(HomeWidgetCopy.eatFallback(planFuelActions: true), "Open Cargo to log")
        XCTAssertEqual(HomeWidgetCopy.eatFailure(planFuelActions: nil), "Couldn't log that bite")
        XCTAssertEqual(HomeWidgetCopy.eatFailure(planFuelActions: true), "Couldn't log to Fuel")
        XCTAssertEqual(HomeWidgetCopy.eatIntentTitle(planFuelActions: false), "Eat one")
        XCTAssertEqual(HomeWidgetCopy.eatIntentTitle(planFuelActions: true), "Log to Fuel")
        XCTAssertEqual(
            HomeWidgetCopy.eatAccessibility(unit: "slice", name: "Bread", eaten: false, planFuelActions: false),
            "Eat one slice of Bread"
        )
        XCTAssertEqual(
            HomeWidgetCopy.eatAccessibility(unit: "slice", name: "Bread", eaten: false, planFuelActions: true),
            "Log one slice of Bread to Fuel"
        )
        XCTAssertEqual(
            HomeWidgetCopy.eatAccessibility(unit: "slice", name: "Bread", eaten: false, planFuelActions: nil),
            "Eat one slice of Bread"
        )
        XCTAssertEqual(HomeWidgetCache.currentSchema, 2)
    }

    func testAPIBaseAllowsHttpsAndLocalhostOnly() {
        XCTAssertTrue(WidgetAPIBase.allows(URL(string: "https://ration.mayutic.com/api/mobile/v1")!))
        XCTAssertTrue(WidgetAPIBase.allows(URL(string: "http://localhost:5173/api/mobile/v1")!))
        XCTAssertFalse(WidgetAPIBase.allows(URL(string: "http://evil.example/api")!))
    }
}
