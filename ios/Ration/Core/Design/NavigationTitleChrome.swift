import SwiftUI
import UIKit

/// Scroll-edge large title and centered inline title, both on ceramic.
/// A forced SwiftUI toolbar background drops the center title on the first scroll.
enum NavigationTitleChrome {
    /// Roots install this appearance. They do not pin `toolbarBackground(.visible)`.
    static let pinsBackgroundVisible = false

    static func scrollEdgeAppearance() -> UINavigationBarAppearance {
        appearance()
    }

    static func standardAppearance() -> UINavigationBarAppearance {
        appearance()
    }

    private static func appearance() -> UINavigationBarAppearance {
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = Theme.ceramicUIColor
        appearance.shadowColor = .clear
        appearance.titleTextAttributes = [.foregroundColor: Theme.carbonUIColor]
        appearance.largeTitleTextAttributes = [.foregroundColor: Theme.carbonUIColor]
        return appearance
    }
}

/// Applies the chrome to the enclosing navigation bar only.
struct NavigationTitleChromeInstaller: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Controller {
        Controller()
    }

    func updateUIViewController(_ controller: Controller, context: Context) {
        controller.apply()
    }

    final class Controller: UIViewController {
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            apply()
        }

        func apply(attempt: Int = 0) {
            view.isHidden = true
            view.isUserInteractionEnabled = false
            view.frame = .zero
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                if self.install() { return }
                guard attempt < 5 else { return }
                self.apply(attempt: attempt + 1)
            }
        }

        /// The background host is a child, so the bar may be a parent navigation controller.
        private func enclosingNavigationBar() -> UINavigationBar? {
            var current: UIViewController? = self
            while let controller = current {
                if let navigation = controller as? UINavigationController {
                    return navigation.navigationBar
                }
                if let bar = controller.navigationController?.navigationBar {
                    return bar
                }
                current = controller.parent
            }
            return nil
        }

        /// The page in the stack. A background child does not own the title item.
        private func enclosingStackItem() -> UIViewController? {
            var current: UIViewController? = self
            while let controller = current {
                if controller.parent is UINavigationController {
                    return controller
                }
                current = controller.parent
            }
            return nil
        }

        @discardableResult
        private func install() -> Bool {
            let stackItem = enclosingStackItem()
            let bar = stackItem?.navigationController?.navigationBar ?? enclosingNavigationBar()
            guard stackItem != nil || bar != nil else { return false }
            if let bar {
                bar.prefersLargeTitles = true
                bar.scrollEdgeAppearance = NavigationTitleChrome.scrollEdgeAppearance()
                bar.compactScrollEdgeAppearance = NavigationTitleChrome.scrollEdgeAppearance()
                bar.standardAppearance = NavigationTitleChrome.standardAppearance()
                bar.compactAppearance = NavigationTitleChrome.standardAppearance()
            }
            if let item = stackItem?.navigationItem {
                item.scrollEdgeAppearance = NavigationTitleChrome.scrollEdgeAppearance()
                item.compactScrollEdgeAppearance = NavigationTitleChrome.scrollEdgeAppearance()
                item.standardAppearance = NavigationTitleChrome.standardAppearance()
                item.compactAppearance = NavigationTitleChrome.standardAppearance()
            }
            return true
        }
    }
}
