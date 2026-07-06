import Foundation
import Observation
import SwiftUI

/// User-controlled unit display — cached locally, synced via mobile settings API.
@MainActor
@Observable
final class UnitDisplayModeStore {
    static let userDefaultsKey = "ration.unitDisplayMode"

    @ObservationIgnored
    private let defaults: UserDefaults

    private(set) var mode: UnitDisplayMode

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let raw = defaults.string(forKey: Self.userDefaultsKey),
           let cached = UnitDisplayMode(rawValue: raw) {
            mode = cached
        } else {
            mode = .metric
        }
    }

    func apply(_ mode: UnitDisplayMode, persist: Bool = true) {
        self.mode = mode
        if persist {
            defaults.set(mode.rawValue, forKey: Self.userDefaultsKey)
        }
    }

    func syncFromServer(_ settings: UserSettings) {
        apply(UnitDisplayMode.resolve(from: settings), persist: true)
    }

    func clear() {
        mode = .metric
        defaults.removeObject(forKey: Self.userDefaultsKey)
    }

    /// Dual-field patch matching web hub action semantics.
    func settingsPatch(for mode: UnitDisplayMode) -> SettingsPatch {
        SettingsPatch(
            supplyUnitMode: mode == .original ? nil : mode.rawValue,
            unitDisplayMode: mode.rawValue
        )
    }
}
