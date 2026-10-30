import UIKit

/// Shared key-window lookup for auth flows that present system UI
/// (Sign in with Apple, Google Sign-In) from the foreground scene.
enum PresentationAnchorProvider {
    @MainActor
    static func windowScene() -> UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
    }

    /// The foreground key window, falling back to any window in the scene set.
    @MainActor
    static func keyWindow() -> UIWindow? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
        return windows.first(where: \.isKeyWindow) ?? windows.first
    }

    @MainActor
    static func rootViewController() -> UIViewController? {
        keyWindow()?.rootViewController
    }
}
