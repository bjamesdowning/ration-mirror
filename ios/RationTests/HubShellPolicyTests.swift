import XCTest
@testable import Ration

final class HubShellPolicyTests: XCTestCase {
    func testFuelAndHubNeverShareTheDock() {
        let cases: [(Bool, MainTab)] = [
            (true, .hub),
            (false, .hub),
            (true, .cargo),
            (false, .manifest),
        ]
        for (showingHub, selected) in cases {
            let fuel = HubShellPolicy.fuelDockActive(showingHub: showingHub, selected: selected)
            let hub = HubShellPolicy.hubDockActive(showingHub: showingHub, editing: false, menu: true)
            XCTAssertFalse(fuel && hub)
            XCTAssertEqual(
                HubShellPolicy.dockTab(showingHub: showingHub, selected: selected),
                showingHub ? .hub : selected
            )
        }
    }

    func testHubDockStaysOffWhileEditing() {
        XCTAssertFalse(
            HubShellPolicy.hubDockActive(showingHub: true, editing: true, menu: true)
        )
    }

    func testCapsuleSymbols() {
        XCTAssertEqual(
            PageCapsulePolicy.symbols(page: "fuel", fuelPageOn: true, manifestLoaded: false),
            ["chart.bar.fill"]
        )
        XCTAssertEqual(
            PageCapsulePolicy.symbols(page: "supply", fuelPageOn: false, manifestLoaded: false),
            ["list.bullet.rectangle"]
        )
        XCTAssertEqual(
            PageCapsulePolicy.symbols(page: "manifest", fuelPageOn: false, manifestLoaded: true),
            ["chart.bar.fill", "calendar"]
        )
        XCTAssertEqual(
            PageCapsulePolicy.symbols(page: "cargo", fuelPageOn: true, manifestLoaded: true),
            []
        )
        XCTAssertFalse(
            PageCapsulePolicy.symbols(page: "fuel", fuelPageOn: true, manifestLoaded: true)
                .contains("chevron")
        )
    }

    func testWidgetRoutes() {
        XCTAssertEqual(HubWidgetRoute.fuelTrends(fuelPageOn: true), .fuel)
        XCTAssertEqual(HubWidgetRoute.fuelTrends(fuelPageOn: false), .nutritionGoals)
        XCTAssertEqual(HubWidgetRoute.supplyPreview(), .supply)
        XCTAssertEqual(HubWidgetRoute.flightRecorder(), .none)
    }

    func testUsableDeviceZones() {
        XCTAssertEqual(FuelDeviceZone.candidate(from: "America/Los_Angeles"), "America/Los_Angeles")
        XCTAssertEqual(FuelDeviceZone.candidate(from: "UTC"), "UTC")
        XCTAssertEqual(FuelDeviceZone.candidate(from: "Etc/UTC"), "Etc/UTC")
        XCTAssertNil(FuelDeviceZone.candidate(from: "GMT"))
        XCTAssertNil(FuelDeviceZone.candidate(from: "PST"))
    }
}
