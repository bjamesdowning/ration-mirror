import XCTest
@testable import Ration

final class NutritionGoalsSavePolicyTests: XCTestCase {
    func testCanEnableSaveRequiresMacroTrackingAndValue() {
        XCTAssertTrue(
            NutritionGoalsSavePolicy.canEnableSave(
                isSaving: false,
                isUnavailable: false,
                hasAnyValue: true,
                macroTrackingEnabled: true
            )
        )
        XCTAssertFalse(
            NutritionGoalsSavePolicy.canEnableSave(
                isSaving: false,
                isUnavailable: false,
                hasAnyValue: true,
                macroTrackingEnabled: false
            )
        )
        XCTAssertFalse(
            NutritionGoalsSavePolicy.canEnableSave(
                isSaving: true,
                isUnavailable: false,
                hasAnyValue: true,
                macroTrackingEnabled: true
            )
        )
        XCTAssertFalse(
            NutritionGoalsSavePolicy.canEnableSave(
                isSaving: false,
                isUnavailable: false,
                hasAnyValue: false,
                macroTrackingEnabled: true
            )
        )
    }

    func testIsMacroTrackingEnabledRequiresAllPurposes() {
        let goals = status(purpose: .goals, state: .active)
        let intake = status(purpose: .intake, state: .active)
        let agent = status(purpose: .agentProcessing, state: .active)
        let inactive = status(purpose: .goals, state: .notGranted)

        XCTAssertTrue(
            NutritionGoalsSavePolicy.isMacroTrackingEnabled(in: [goals, intake, agent])
        )
        XCTAssertFalse(
            NutritionGoalsSavePolicy.isMacroTrackingEnabled(in: [goals, intake])
        )
        XCTAssertFalse(
            NutritionGoalsSavePolicy.isMacroTrackingEnabled(in: [inactive, intake, agent])
        )
    }

    func testHasActiveGoalsConsent() {
        let inactive = status(purpose: .goals, state: .notGranted)
        let intakeActive = status(purpose: .intake, state: .active)
        let active = status(purpose: .goals, state: .active)
        XCTAssertFalse(NutritionGoalsSavePolicy.hasActiveGoalsConsent(in: [inactive, intakeActive]))
        XCTAssertTrue(NutritionGoalsSavePolicy.hasActiveGoalsConsent(in: [active]))
    }

    private func status(
        purpose: NutritionConsentPurpose,
        state: NutritionConsentState
    ) -> NutritionConsentStatus {
        NutritionConsentStatus(
            purpose: purpose,
            state: state,
            consentId: state == .active ? "id" : nil,
            grantedAt: nil,
            withdrawnAt: nil,
            statement: NutritionConsentStatement(
                purpose: purpose,
                policyVersion: "2026-08-09",
                statementVersion: "v1",
                text: "statement",
                sha256: String(repeating: "a", count: 64),
                privacyNoticeVersion: "2026-08-09"
            )
        )
    }
}
