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

        init(onReselect: @escaping (Int) -> Void) {
            self.onReselect = onReselect
        }

        func attachIfNeeded(from viewController: UIViewController) {
            DispatchQueue.main.async { [weak self, weak viewController] in
                guard let self, let viewController else { return }
                guard let tab = Self.findTabBarController(from: viewController) else { return }

                if tabBarController !== tab {
                    if let existing = tabBarController {
                        existing.delegate = previousDelegate
                    }
                    tabBarController = tab
                    lastSelectedIndex = tab.selectedIndex
                    previousDelegate = nil
                }

                // SwiftUI may replace the delegate on later layout passes — reassert ownership.
                if tab.delegate !== self {
                    if let current = tab.delegate {
                        previousDelegate = current
                    }
                    tab.delegate = self
                }
            }
        }

        func detach() {
            if let tab = tabBarController, tab.delegate === self {
                tab.delegate = previousDelegate
            }
            tabBarController = nil
            previousDelegate = nil
            lastSelectedIndex = nil
        }

        func tabBarController(
            _ tabBarController: UITabBarController,
            shouldSelect viewController: UIViewController
        ) -> Bool {
            previousDelegate?.tabBarController?(tabBarController, shouldSelect: viewController) ?? true
        }

        func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
            previousDelegate?.tabBarController?(tabBarController, didSelect: viewController)

            guard let index = tabBarController.viewControllers?.firstIndex(of: viewController) else {
                return
            }

            let wasReselect = lastSelectedIndex == index
            lastSelectedIndex = index
            if wasReselect {
                onReselect(index)
            }
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
