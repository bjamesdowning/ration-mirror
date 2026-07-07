import UIKit

/// Shared key-window / presentation lookup for auth flows that must present
/// system UI (Sign in with Apple, Google Sign-In) from the foreground scene.
///
/// Centralises the `connectedScenes` → key-window traversal that both
/// `AppleSignInCoordinator` and `GoogleSignInService` previously duplicated.
enum PresentationAnchorProvider {
    /// The foreground key window, falling back to any window in the scene set.
    @MainActor
    static func keyWindow() -> UIWindow? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
        return windows.first(where: \.isKeyWindow) ?? windows.first
    }

    /// The root view controller of the key window — Google Sign-In presenter.
    @MainActor
    static func rootViewController() -> UIViewController? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
        if let root = windows.first(where: \.isKeyWindow)?.rootViewController {
            return root
        }
        return windows.first?.rootViewController
    }
}
