import SwiftUI
import UIKit
import XCTest
@testable import Ration

/// The iOS 26 tab accessory clips to one bar. The dock is an overlay above that bar,
/// and the scroll view shrinks so Hub text does not sit underneath it.
@MainActor
final class TabAccessoryLayoutProbeTests: XCTestCase {
    func testDockClearsTabBarAndScrollEndsAboveDock() throws {
        let box = FrameBox()
        let host = UIHostingController(rootView: DockClearanceProbe(box: box))
        let window = try makeWindow(root: host)
        let controller = waitForTabBar(in: window)
        let deadline = Date().addingTimeInterval(1.2)
        while Date() < deadline { pump() }

        let scroll = try XCTUnwrap(box.frames["scroll"])
        let dock = try XCTUnwrap(box.frames["dock"])
        let tabBar = controller.tabBar.frame
        let report = """
        tabBar=\(tabBar)
        scroll=\(scroll)
        dock=\(dock)
        """
        XCTAssertLessThanOrEqual(dock.maxY, tabBar.minY + 1, report)
        XCTAssertLessThanOrEqual(scroll.maxY, dock.minY + 1, report)
        window.isHidden = true
    }

    private func makeWindow(root: UIViewController) throws -> UIWindow {
        let frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
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
        let deadline = Date().addingTimeInterval(3)
        while Date() < deadline {
            pump()
            if let controller = findTabBar(in: window.rootViewController) { return controller }
        }
        XCTFail("Tab bar did not install")
        return UITabBarController()
    }

    private func findTabBar(in viewController: UIViewController?) -> UITabBarController? {
        guard let viewController else { return nil }
        if let tab = viewController as? UITabBarController { return tab }
        for child in viewController.children {
            if let tab = findTabBar(in: child) { return tab }
        }
        return nil
    }

    private func pump() {
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    }
}

private final class FrameBox {
    var frames: [String: CGRect] = [:]
}

private struct FrameMarker: UIViewRepresentable {
    let name: String
    let box: FrameBox

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async {
            box.frames[name] = uiView.convert(uiView.bounds, to: nil)
        }
    }
}

private struct DockClearanceProbe: View {
    let box: FrameBox
    @State private var overlap = CopilotDockLayout.tabBarOverlapFallback

    var body: some View {
        TabView {
            NavigationStack {
                GeometryReader { geometry in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Meals ready")
                            Text("Weeknight chili")
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, minHeight: geometry.size.height + 1, alignment: .top)
                    }
                    .background(FrameMarker(name: "scroll", box: box))
                    .padding(.bottom, CopilotDockLayout.dockHeight(isExpanded: true, hasTabAction: true))
                }
                .navigationTitle("Hub")
            }
            .tabItem { Label("Hub", systemImage: "square.grid.2x2") }
        }
        .overlay(alignment: .bottom) {
            VStack(spacing: CopilotDockLayout.dockRowSpacing) {
                Text("Scan")
                    .frame(width: CopilotDockLayout.fabSize, height: CopilotDockLayout.fabSize)
                Text("Ask Ration")
                    .frame(maxWidth: .infinity, minHeight: CopilotDockLayout.expandedInputBarHeight)
            }
            .padding(.bottom, CopilotDockLayout.dockBottomPadding)
            .background(FrameMarker(name: "dock", box: box))
            .padding(.bottom, overlap)
        }
        .background {
            TabBarOverlapReader { measured in
                if abs(overlap - measured) > 0.5 {
                    overlap = measured
                }
            }
        }
    }
}
