import SwiftUI
import UIKit
import XCTest
@testable import Ration

/// Tab-bar selection stays forwarded through `TabBarReselectObserver`, and the
/// group control keeps its own Hyper Green diamond on the iOS 26 toolbar.
@MainActor
final class TabBarAndGroupButtonTests: XCTestCase {
    func testShouldSelectTabForwardsPreviousAnswer() throws {
        let previous = RecordingTabDelegate()
        previous.allowSelection = false
        let controller = makeController()
        controller.delegate = previous
        let coordinator = TabBarReselectObserver.Coordinator { _ in }
        coordinator.claim(controller)

        let allowed = coordinator.tabBarController(controller, shouldSelectTab: try XCTUnwrap(controller.tabs[safe: 1]))

        XCTAssertFalse(allowed)
        XCTAssertEqual(previous.shouldSelectTabCount, 1)
        XCTAssertEqual(controller.selectedIndex, 0)
    }

    func testMissingShouldSelectTabAllowsSelection() throws {
        let controller = makeController()
        let coordinator = TabBarReselectObserver.Coordinator { _ in }
        coordinator.claim(controller)

        XCTAssertTrue(coordinator.tabBarController(controller, shouldSelectTab: try XCTUnwrap(controller.tabs[safe: 2])))
        let galley = try XCTUnwrap(controller.tabs[safe: 2]?.viewController)
        XCTAssertTrue(coordinator.tabBarController(controller, shouldSelect: galley))
    }

    func testDidSelectTabReportsReselectAndForwards() throws {
        let previous = RecordingTabDelegate()
        let controller = makeController()
        controller.delegate = previous
        var reselects: [Int] = []
        let coordinator = TabBarReselectObserver.Coordinator { reselects.append($0) }
        coordinator.claim(controller)
        let hub = try XCTUnwrap(controller.tabs[safe: 0])

        coordinator.tabBarController(controller, didSelectTab: hub, previousTab: hub)
        let hubController = try XCTUnwrap(hub.viewController)
        coordinator.tabBarController(controller, didSelect: hubController)

        XCTAssertEqual(reselects, [0])
        XCTAssertEqual(previous.didSelectTabCount, 1)
    }

    func testDidSelectTabSwitchDoesNotReportReselect() throws {
        let controller = makeController()
        var reselects: [Int] = []
        let coordinator = TabBarReselectObserver.Coordinator { reselects.append($0) }
        coordinator.claim(controller)

        coordinator.tabBarController(
            controller,
            didSelectTab: try XCTUnwrap(controller.tabs[safe: 1]),
            previousTab: controller.tabs[safe: 0]
        )
        let cargo = try XCTUnwrap(controller.tabs[safe: 1])
        let cargoController = try XCTUnwrap(cargo.viewController)
        coordinator.tabBarController(controller, didSelect: cargoController)

        XCTAssertTrue(reselects.isEmpty)
    }

    func testForwardsEditingCallbackSwiftUIStillImplements() {
        let previous = RecordingTabDelegate()
        let controller = makeController()
        controller.delegate = previous
        let coordinator = TabBarReselectObserver.Coordinator { _ in }
        coordinator.claim(controller)
        let selector = #selector(UITabBarControllerDelegate.tabBarControllerWillBeginEditing(_:))

        XCTAssertTrue(coordinator.responds(to: selector))
        coordinator.perform(selector, with: controller)

        XCTAssertEqual(previous.editingCount, 1)
    }

    func testSwiftUITabSelectionSurvivesForwardedDelegate() throws {
        let selected = TabSelectionBox(index: 0)
        let host = UIHostingController(rootView: SelectionTabProbe(selected: selected))
        let window = try makeWindow(root: host)

        let controller = waitForTabBar(in: window)
        let coordinator = try XCTUnwrap(controller.delegate as? TabBarReselectObserver.Coordinator)
        let cargoViewController = try XCTUnwrap(controller.viewControllers?[1])
        XCTAssertTrue(coordinator.tabBarController(controller, shouldSelect: cargoViewController))
        if let cargo = controller.tabs[safe: 1] {
            XCTAssertTrue(coordinator.tabBarController(controller, shouldSelectTab: cargo))
            controller.selectedTab = cargo
            coordinator.tabBarController(
                controller,
                didSelectTab: cargo,
                previousTab: controller.tabs[safe: 0]
            )
        }
        controller.selectedIndex = 1
        coordinator.tabBarController(controller, didSelect: cargoViewController)
        let deadline = Date().addingTimeInterval(2)
        while selected.index != 1, Date() < deadline {
            pump()
        }

        XCTAssertEqual(selected.index, 1)
        XCTAssertEqual(controller.selectedIndex, 1)
        window.isHidden = true
    }

    func testGroupButtonKeepsHyperGreenDiamond() throws {
        let env = AppEnvironment()
        env.session.installSessionForTesting(try makeSignedInSession())
        XCTAssertFalse(env.session.clientFlags.isSupplyMultiListsEnabled)
        XCTAssertFalse(env.session.clientFlags.isRationCopilotEnabled)
        XCTAssertNotNil(env.session.activeOrg)

        let host = UIHostingController(
            rootView: NavigationStack {
                Color.clear
                    .toolbar {
                        GlobalPageToolbar(
                            onOpenGroupSettings: {},
                            onOpenSettings: {}
                        )
                    }
                    .navigationBarTitleDisplayMode(.inline)
            }
            .environment(env)
        )
        let window = try makeWindow(root: host)
        pump()
        let rendered = ImageRenderer(
            content: OrgSwitcherBar(onTap: {})
                .padding(24)
                .background(Color.white)
                .environment(env)
                .environment(\.colorScheme, .light)
        )
        rendered.proposedSize = ProposedViewSize(width: 360, height: 120)
        rendered.scale = 3
        let image = try XCTUnwrap(rendered.uiImage)
        if let data = image.pngData() {
            try? data.write(to: URL(fileURLWithPath: "/tmp/group-button.png"))
        }
        XCTAssertTrue(
            image.containsGreenDiamond(),
            "Group settings diamond was not Hyper Green (image: \(image.size))"
        )
        XCTAssertNotNil(window.rootViewController)
        window.isHidden = true
    }

    private func makeSignedInSession() throws -> SessionResponse {
        let json = """
        {
          "user": {"id": "user-1", "email": "cook@ration.app"},
          "organization": {"id": "org-1", "name": "Galley", "credits": 12},
          "credits": 12,
          "tier": "free",
          "isTierExpired": false,
          "organizations": [
            {"id": "org-1", "name": "Galley", "credits": 12, "role": "owner", "isActive": true}
          ],
          "clientFlags": {}
        }
        """
        return try JSONDecoder().decode(SessionResponse.self, from: Data(json.utf8))
    }

    private func makeController() -> UITabBarController {
        let titles = ["Hub", "Cargo", "Galley", "Manifest", "Supply"]
        let controllers = titles.enumerated().map { index, title in
            let viewController = UIViewController()
            viewController.title = title
            viewController.tabBarItem = UITabBarItem(title: title, image: nil, tag: index)
            return viewController
        }
        let tabs = zip(titles, controllers).map { title, viewController in
            UITab(title: title, image: nil, identifier: title) { _ in viewController }
        }
        let controller = UITabBarController(tabs: tabs)
        controller.loadViewIfNeeded()
        for tab in controller.tabs {
            _ = tab.viewController
        }
        return controller
    }

    private func makeWindow(root: UIViewController) throws -> UIWindow {
        let frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first,
            "iOS 26 simulator scene"
        )
        let window = UIWindow(windowScene: scene)
        window.frame = frame
        window.rootViewController = root
        window.makeKeyAndVisible()
        root.beginAppearanceTransition(true, animated: false)
        root.endAppearanceTransition()
        root.view.layoutIfNeeded()
        return window
    }

    private func waitForTabBar(in window: UIWindow) -> UITabBarController {
        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            pump()
            if let controller = findTabBar(in: window.rootViewController),
           controller.tabs.count == 5 || controller.viewControllers?.count == 5 {
                return controller
            }
        }
        XCTFail("Tab bar did not install")
        return UITabBarController()
    }

    private func findTabBar(in viewController: UIViewController?) -> UITabBarController? {
        guard let viewController else { return nil }
        if let tab = viewController as? UITabBarController { return tab }
        if let tab = viewController.tabBarController { return tab }
        for child in viewController.children {
            if let tab = findTabBar(in: child) { return tab }
        }
        if let presented = viewController.presentedViewController {
            if let tab = findTabBar(in: presented) { return tab }
        }
        var responder: UIResponder? = viewController.view
        while let next = responder?.next {
            if let tab = next as? UITabBarController { return tab }
            responder = next
        }
        return nil
    }

    private func pump() {
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

private final class TabSelectionBox {
    var index: Int
    init(index: Int) { self.index = index }
}

private struct SelectionTabProbe: View {
    let selected: TabSelectionBox
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            Text("Hub").tabItem { Label("Hub", systemImage: "square.grid.2x2") }.tag(0)
            Text("Cargo").tabItem { Label("Cargo", systemImage: "shippingbox") }.tag(1)
            Text("Galley").tabItem { Label("Galley", systemImage: "fork.knife") }.tag(2)
            Text("Manifest").tabItem { Label("Manifest", systemImage: "calendar") }.tag(3)
            Text("Supply").tabItem { Label("Supply", systemImage: "cart") }.tag(4)
        }
        .background {
            TabBarReselectObserver { _ in }
        }
        .onChange(of: tab) { _, newValue in
            selected.index = newValue
        }
    }
}

private final class RecordingTabDelegate: NSObject, UITabBarControllerDelegate {
    var allowSelection = true
    var shouldSelectTabCount = 0
    var didSelectTabCount = 0
    var editingCount = 0

    func tabBarController(_ tabBarController: UITabBarController, shouldSelectTab tab: UITab) -> Bool {
        shouldSelectTabCount += 1
        return allowSelection
    }

    func tabBarController(
        _ tabBarController: UITabBarController,
        didSelectTab selectedTab: UITab,
        previousTab: UITab?
    ) {
        didSelectTabCount += 1
    }

    func tabBarControllerWillBeginEditing(_ tabBarController: UITabBarController) {
        editingCount += 1
    }
}

private extension UIImage {
    /// Hyper Green diamond: green channel leads, and it is not a black or gray mark.
    func containsGreenDiamond() -> Bool {
        guard let cgImage else { return false }
        let width = cgImage.width
        let height = cgImage.height
        guard width > 0, height > 0 else { return false }
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        guard let context = CGContext(
            data: &pixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return false }
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        for offset in stride(from: 0, to: pixels.count, by: 4) {
            let red = Int(pixels[offset])
            let green = Int(pixels[offset + 1])
            let blue = Int(pixels[offset + 2])
            if green >= 140, green > red + 40, green > blue + 20 {
                return true
            }
        }
        return false
    }
}
