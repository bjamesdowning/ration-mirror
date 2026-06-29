import Foundation

/// Persists dismissed Hub "next action" cards per organization.
@MainActor
final class NextActionDismissStore {
    private let defaults: UserDefaults
    private let prefix = "ration.nextAction.dismissed."

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func isDismissed(actionKey: String, organizationId: String) -> Bool {
        defaults.bool(forKey: key(actionKey, organizationId: organizationId))
    }

    func dismiss(actionKey: String, organizationId: String) {
        defaults.set(true, forKey: key(actionKey, organizationId: organizationId))
    }

    func clear(organizationId: String) {
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(prefix + organizationId) {
            defaults.removeObject(forKey: key)
        }
    }

    private func key(_ actionKey: String, organizationId: String) -> String {
        prefix + organizationId + "." + actionKey
    }
}
