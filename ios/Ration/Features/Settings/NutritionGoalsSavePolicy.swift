import Foundation

/// Pure enablement checks for Nutrition Goals Save.
enum NutritionGoalsSavePolicy {
    static func canEnableSave(
        isSaving: Bool,
        isUnavailable: Bool,
        hasAnyValue: Bool,
        macroTrackingEnabled: Bool
    ) -> Bool {
        !isSaving
            && !isUnavailable
            && hasAnyValue
            && macroTrackingEnabled
    }

    static func isMacroTrackingEnabled(
        in consents: [NutritionConsentStatus]
    ) -> Bool {
        let purposes: [NutritionConsentPurpose] = [.goals, .intake, .agentProcessing]
        return purposes.allSatisfy { purpose in
            consents.contains { $0.purpose == purpose && $0.state == .active }
        }
    }

    static func hasActiveGoalsConsent(
        in consents: [NutritionConsentStatus]
    ) -> Bool {
        consents.contains { $0.purpose == .goals && $0.state == .active }
    }
}
