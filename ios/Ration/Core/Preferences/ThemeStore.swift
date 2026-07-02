import Foundation
import Observation
import SwiftUI

enum AppTheme: String, CaseIterable, Codable, Sendable {
    case light
    case dark

    init?(serverValue: String?) {
        guard let serverValue else { return nil }
        self.init(rawValue: serverValue)
    }
}

/// User-controlled light/dark appearance — cached locally for instant cold start,
/// synced via `user.settings.theme` on the mobile API.
@MainActor
@Observable
final class ThemeStore {
    static let userDefaultsKey = "ration.theme"

    @ObservationIgnored
    private let defaults: UserDefaults

    private(set) var theme: AppTheme

    var colorScheme: ColorScheme {
        theme == .dark ? .dark : .light
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let raw = defaults.string(forKey: Self.userDefaultsKey),
           let cached = AppTheme(rawValue: raw) {
            theme = cached
        } else {
            theme = .dark
        }
    }

    func apply(_ theme: AppTheme, persist: Bool = true) {
        self.theme = theme
        if persist {
            defaults.set(theme.rawValue, forKey: Self.userDefaultsKey)
        }
    }

    /// Server settings win on login — updates local cache when they differ.
    func syncFromServer(_ settings: UserSettings) {
        let serverTheme = AppTheme(serverValue: settings.theme) ?? .dark
        apply(serverTheme, persist: true)
    }

    /// Cleared on sign-out so the next account on a shared device starts fresh.
    func clear() {
        theme = .dark
        defaults.removeObject(forKey: Self.userDefaultsKey)
    }
}
