import Foundation

/// Pure enablement + grant-success checks for Nutrition Goals Save.
enum NutritionGoalsSavePolicy {
    static func canEnableSave(
        isSaving: Bool,
        isUnavailable: Bool,
        hasAnyValue: Bool,
        hasActiveGoalsConsent: Bool,
        affirmedGoalsConsent: Bool
    ) -> Bool {
        !isSaving
            && !isUnavailable
            && hasAnyValue
            && (hasActiveGoalsConsent || affirmedGoalsConsent)
    }

    static func hasActiveGoalsConsent(
        in consents: [NutritionConsentStatus]
    ) -> Bool {
        consents.contains { $0.purpose == .goals && $0.state == .active }
    }
}
