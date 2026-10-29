import SwiftUI
import UIKit

/// Observes UIKit tab bar re-taps. SwiftUI `TabView` does not fire selection changes when
/// the already-selected tab is tapped again; this bridge surfaces those events.
struct TabBarReselectObserver: UIViewControllerRepresentable {
    var onReselect: (Int) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onReselect: onReselect)
    }

    func makeUIViewController(context: Context) -> UIViewController {
        let controller = UIViewController()
        controller.view.isUserInteractionEnabled = false
        controller.view.backgroundColor = .clear
        return controller
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        context.coordinator.onReselect = onReselect
        context.coordinator.attachIfNeeded(from: uiViewController)
    }

    static func dismantleUIViewController(_ uiViewController: UIViewController, coordinator: Coordinator) {
        coordinator.detach()
    }

    final class Coordinator: NSObject, UITabBarControllerDelegate {
        var onReselect: (Int) -> Void
        private weak var tabBarController: UITabBarController?
        private weak var previousDelegate: UITabBarControllerDelegate?
        private var lastSelectedIndex: Int?
        /// `didSelect` and `didSelectTab` can both run for one tap. The first one decides the reselect.
        private var didNoteSelectionThisTurn = false

        init(onReselect: @escaping (Int) -> Void) {
            self.onReselect = onReselect
        }

        func attachIfNeeded(from viewController: UIViewController) {
            DispatchQueue.main.async { [weak self, weak viewController] in
                guard let self, let viewController else { return }
                guard let tab = Self.findTabBarController(from: viewController) else { return }
                claim(tab)
            }
        }

        /// Saves SwiftUI's delegate, then becomes the tab bar delegate.
        func claim(_ tab: UITabBarController) {
            if tabBarController !== tab {
                if let existing = tabBarController, existing.delegate === self {
                    existing.delegate = previousDelegate
                }
                tabBarController = tab
                lastSelectedIndex = tab.selectedIndex
                previousDelegate = nil
                didNoteSelectionThisTurn = false
            }

            // SwiftUI may replace the delegate on later layout passes — reassert ownership.
            if tab.delegate !== self {
                if let current = tab.delegate, current !== self {
                    previousDelegate = current
                }
                tab.delegate = self
            }
        }

        func detach() {
            if let tab = tabBarController, tab.delegate === self {
                tab.delegate = previousDelegate
            }
            tabBarController = nil
            previousDelegate = nil
            lastSelectedIndex = nil
            didNoteSelectionThisTurn = false
        }

        override func responds(to aSelector: Selector!) -> Bool {
            if super.responds(to: aSelector) {
                return true
            }
            guard let previous = previousDelegate, previous !== self else { return false }
            return previous.responds(to: aSelector)
        }

        override func forwardingTarget(for aSelector: Selector!) -> Any? {
            if super.responds(to: aSelector) {
                return nil
            }
            guard let previous = previousDelegate, previous !== self else {
                return super.forwardingTarget(for: aSelector)
            }
            if previous.responds(to: aSelector) {
                return previous
            }
            return super.forwardingTarget(for: aSelector)
        }

        func tabBarController(
            _ tabBarController: UITabBarController,
            shouldSelect viewController: UIViewController
        ) -> Bool {
            forwardShouldSelect(tabBarController, viewController: viewController)
        }

        func tabBarController(
            _ tabBarController: UITabBarController,
            shouldSelectTab tab: UITab
        ) -> Bool {
            let selector = #selector(UITabBarControllerDelegate.tabBarController(_:shouldSelectTab:))
            guard let previous = previousDelegate, previous !== self, previous.responds(to: selector) else {
                return true
            }
            return previous.tabBarController?(tabBarController, shouldSelectTab: tab) ?? true
        }

        func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
            previousDelegate?.tabBarController?(tabBarController, didSelect: viewController)

            guard let index = tabBarController.viewControllers?.firstIndex(of: viewController) else {
                return
            }
            noteSelection(index: index, isReselect: lastSelectedIndex == index)
        }

        func tabBarController(
            _ tabBarController: UITabBarController,
            didSelectTab selectedTab: UITab,
            previousTab: UITab?
        ) {
            previousDelegate?.tabBarController?(
                tabBarController,
                didSelectTab: selectedTab,
                previousTab: previousTab
            )
            guard let index = rootIndex(of: selectedTab, in: tabBarController) else { return }
            let isReselect = previousTab.map { sameTab(selectedTab, $0) } ?? false
            noteSelection(index: index, isReselect: isReselect)
        }

        private func forwardShouldSelect(
            _ tabBarController: UITabBarController,
            viewController: UIViewController
        ) -> Bool {
            let selector = #selector(UITabBarControllerDelegate.tabBarController(_:shouldSelect:))
            guard let previous = previousDelegate, previous !== self, previous.responds(to: selector) else {
                return true
            }
            return previous.tabBarController?(tabBarController, shouldSelect: viewController) ?? true
        }

        private func noteSelection(index: Int, isReselect: Bool) {
            if didNoteSelectionThisTurn {
                lastSelectedIndex = index
                return
            }
            didNoteSelectionThisTurn = true
            lastSelectedIndex = index
            if isReselect {
                onReselect(index)
            }
            DispatchQueue.main.async { [weak self] in
                self?.didNoteSelectionThisTurn = false
            }
        }

        private func sameTab(_ lhs: UITab, _ rhs: UITab) -> Bool {
            lhs === rhs || lhs.identifier == rhs.identifier
        }

        private func rootIndex(of tab: UITab, in controller: UITabBarController) -> Int? {
            let root = rootTab(of: tab)
            if let viewController = root.viewController,
               let index = controller.viewControllers?.firstIndex(of: viewController) {
                return index
            }
            return controller.tabs.firstIndex { candidate in
                candidate === root || candidate.identifier == root.identifier
            }
        }

        private func rootTab(of tab: UITab) -> UITab {
            var current = tab
            while let parent = current.parent {
                current = parent
            }
            return current
        }

        private static func findTabBarController(from viewController: UIViewController) -> UITabBarController? {
            var current: UIViewController? = viewController
            while let candidate = current {
                if let tab = candidate as? UITabBarController {
                    return tab
                }
                if let tab = candidate.tabBarController {
                    return tab
                }
                current = candidate.parent
            }

            var responder: UIResponder? = viewController.view
            while let next = responder?.next {
                if let tab = next as? UITabBarController {
                    return tab
                }
                responder = next
            }

            let roots = viewController.view.window.map { [$0] }
                ?? UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)

            for window in roots {
                if let tab = findTabBarController(in: window.rootViewController) {
                    return tab
                }
            }

            return nil
        }

        private static func findTabBarController(in root: UIViewController?) -> UITabBarController? {
            guard let root else { return nil }
            if let tab = root as? UITabBarController {
                return tab
            }
            for child in root.children {
                if let tab = findTabBarController(in: child) {
                    return tab
                }
            }
            if let presented = root.presentedViewController {
                return findTabBarController(in: presented)
            }
            return nil
        }
    }
}
