import Foundation
import Observation

/// Persists dismissed Hub "next action" cards per organization.
@MainActor
@Observable
final class NextActionDismissStore {
    @ObservationIgnored
    private let defaults: UserDefaults
    private let prefix = "ration.nextAction.dismissed."

    /// Bumped on dismiss so SwiftUI views re-evaluate visibility.
    private(set) var revision = 0

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func isDismissed(actionKey: String, organizationId: String) -> Bool {
        _ = revision
        return defaults.bool(forKey: key(actionKey, organizationId: organizationId))
    }

    func dismiss(actionKey: String, organizationId: String) {
        defaults.set(true, forKey: key(actionKey, organizationId: organizationId))
        revision += 1
    }

    func clear(organizationId: String) {
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(prefix + organizationId) {
            defaults.removeObject(forKey: key)
        }
        revision += 1
    }

    /// Removes dismiss flags for every organization (sign-out / account switch wipe).
    func clearAll() {
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(prefix) {
            defaults.removeObject(forKey: key)
        }
        revision += 1
    }

    private func key(_ actionKey: String, organizationId: String) -> String {
        prefix + organizationId + "." + actionKey
    }
}
