import UIKit
import XCTest
@testable import Ration

final class FuelPageRepairTests: XCTestCase {
    private func resolved(_ color: UIColor?, style: UIUserInterfaceStyle) -> UIColor? {
        color?.resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
    }

    func testFuelDayURLKeepsTheDateInTheQuery() throws {
        let url = MobileRequestURL.make(
            base: URL(string: "https://ration.mayutic.com/api/mobile/v1")!,
            path: "nutrition/fuel",
            query: [URLQueryItem(name: "date", value: "2026-11-11")]
        )
        let components = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))

        XCTAssertTrue(components.path.hasSuffix("/nutrition/fuel"))
        XCTAssertEqual(components.query, "date=2026-11-11")
        XCTAssertTrue(url.absoluteString.contains("?date="))
        XCTAssertFalse(url.absoluteString.contains("%3F"))
    }

    func testNilDayLoadsTodayBeforeAddScanOrBarcode() {
        let today = "2026-11-11"
        for action in FuelCreateAction.allCases {
            XCTAssertEqual(FuelMenuCopy.label(for: action).isEmpty, false)
            XCTAssertTrue(FuelMenuRouting.needsTodayLoad(loadedDate: nil, today: today))
            XCTAssertFalse(FuelMenuRouting.canOpen(loadedDate: nil, today: today))
            let opened = FuelActionPolicy.decide(
                action: action,
                used: 0,
                limit: 3,
                isOnline: true,
                cameraDenied: false
            )
            switch action {
            case .add:
                XCTAssertEqual(opened, .openForm)
            case .scan:
                XCTAssertEqual(opened, .openCamera)
            case .barcode:
                XCTAssertEqual(opened, .openBarcodeCamera)
            }
        }
        XCTAssertEqual(
            FuelMenuCopy.labels,
            ["Add Fuel", "Scan to Fuel", "Barcode to Fuel"]
        )
        XCTAssertTrue(FuelMenuRouting.needsTodayLoad(loadedDate: "2026-11-10", today: today))
        XCTAssertFalse(FuelMenuRouting.canOpen(loadedDate: "2026-11-10", today: today))
        XCTAssertFalse(FuelMenuRouting.needsTodayLoad(loadedDate: today, today: today))
        XCTAssertTrue(FuelMenuRouting.canOpen(loadedDate: today, today: today))
    }

    func testActiveFuelMenuSurvivesDisappear() {
        XCTAssertFalse(TabDockLifecycle.clearsRegistrationOnDisappear(isActive: true, layer: .root))
        XCTAssertTrue(TabDockLifecycle.clearsRegistrationOnDisappear(isActive: false, layer: .root))
        XCTAssertTrue(TabDockLifecycle.clearsRegistrationOnDisappear(isActive: true, layer: .detail))
        XCTAssertTrue(TabDockLifecycle.clearsRegistrationOnDisappear(isActive: true, layer: .lists))
    }

    func testDockPutsFuelInTheCenterOnlyWhenTheFlagIsOn() {
        XCTAssertEqual(
            DockOrder.tabs(fuelPageOn: true),
            [.cargo, .galley, .hub, .manifest, .supply]
        )
        XCTAssertEqual(
            DockOrder.tabs(fuelPageOn: false),
            [.hub, .cargo, .galley, .manifest, .supply]
        )
        XCTAssertEqual(DockOrder.tab(at: 0, fuelPageOn: true), .cargo)
        XCTAssertEqual(DockOrder.tab(at: 2, fuelPageOn: true), .hub)
        XCTAssertEqual(DockOrder.tab(at: 0, fuelPageOn: false), .hub)
        XCTAssertEqual(DockOrder.tabs(fuelPageOn: true).count, 5)
        XCTAssertEqual(DockOrder.tabs(fuelPageOn: false).count, 5)
    }

    func testTitleAppearancesKeepTheCollapsedTitle() {
        XCTAssertFalse(NavigationTitleChrome.pinsBackgroundVisible)
        let expanded = NavigationTitleChrome.scrollEdgeAppearance()
        let collapsed = NavigationTitleChrome.standardAppearance()

        XCTAssertNotNil(expanded.largeTitleTextAttributes[.foregroundColor])
        XCTAssertNotNil(collapsed.titleTextAttributes[.foregroundColor])
        XCTAssertEqual(
            resolved(expanded.backgroundColor, style: .light),
            resolved(Theme.ceramicUIColor, style: .light)
        )
        XCTAssertEqual(
            resolved(collapsed.backgroundColor, style: .dark),
            resolved(Theme.ceramicUIColor, style: .dark)
        )
        XCTAssertNotEqual(ObjectIdentifier(expanded), ObjectIdentifier(collapsed))
    }

    func testScrollingKeepsTheNavigationTitle() {
        let root = UIViewController()
        let scroll = UIScrollView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        scroll.contentSize = CGSize(width: 390, height: 2000)
        root.view = scroll
        root.navigationItem.title = "Fuel"
        root.navigationItem.largeTitleDisplayMode = .always

        let navigation = UINavigationController(rootViewController: root)
        navigation.navigationBar.prefersLargeTitles = true
        navigation.navigationBar.scrollEdgeAppearance = NavigationTitleChrome.scrollEdgeAppearance()
        navigation.navigationBar.standardAppearance = NavigationTitleChrome.standardAppearance()

        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = navigation
        window.makeKeyAndVisible()
        navigation.view.layoutIfNeeded()

        XCTAssertEqual(root.navigationItem.title, "Fuel")
        scroll.setContentOffset(CGPoint(x: 0, y: 240), animated: false)
        navigation.view.layoutIfNeeded()
        XCTAssertEqual(root.navigationItem.title, "Fuel")
        XCTAssertNotNil(
            navigation.navigationBar.standardAppearance.titleTextAttributes[.foregroundColor]
        )

        scroll.setContentOffset(.zero, animated: false)
        navigation.view.layoutIfNeeded()
        XCTAssertEqual(root.navigationItem.title, "Fuel")
        XCTAssertNotNil(
            navigation.navigationBar.scrollEdgeAppearance?.largeTitleTextAttributes[.foregroundColor]
        )
        window.isHidden = true
    }

    func testInstallerWritesBothAppearancesOnTheParentBar() {
        let root = UIViewController()
        root.navigationItem.title = "Lists"
        let navigation = UINavigationController(rootViewController: root)
        let installer = NavigationTitleChromeInstaller.Controller()
        root.addChild(installer)
        root.view.addSubview(installer.view)
        installer.didMove(toParent: root)

        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = navigation
        window.makeKeyAndVisible()
        navigation.view.layoutIfNeeded()

        let installed = expectation(description: "navigation bar appearances")
        installer.apply()
        DispatchQueue.main.async {
            XCTAssertTrue(navigation.navigationBar.prefersLargeTitles)
            XCTAssertNotNil(
                navigation.navigationBar.scrollEdgeAppearance?.largeTitleTextAttributes[.foregroundColor]
            )
            XCTAssertNotNil(
                navigation.navigationBar.standardAppearance.titleTextAttributes[.foregroundColor]
            )
            XCTAssertNotNil(
                navigation.navigationBar.compactAppearance?.titleTextAttributes[.foregroundColor]
            )
            XCTAssertNotNil(
                root.navigationItem.standardAppearance?.titleTextAttributes[.foregroundColor]
            )
            XCTAssertNotNil(
                root.navigationItem.scrollEdgeAppearance?.largeTitleTextAttributes[.foregroundColor]
            )
            installed.fulfill()
        }
        wait(for: [installed], timeout: 1)
        window.isHidden = true
    }
}
