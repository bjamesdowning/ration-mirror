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

        @discardableResult
        private func install() -> Bool {
            guard let bar = enclosingNavigationBar() else { return false }
            bar.prefersLargeTitles = true
            let expanded = NavigationTitleChrome.scrollEdgeAppearance()
            let collapsed = NavigationTitleChrome.standardAppearance()
            bar.scrollEdgeAppearance = expanded
            bar.compactScrollEdgeAppearance = expanded
            bar.standardAppearance = collapsed
            bar.compactAppearance = collapsed
            return true
        }
    }
}
