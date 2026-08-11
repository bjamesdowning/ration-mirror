import XCTest
@testable import Ration

final class NutritionGoalsSavePolicyTests: XCTestCase {
    func testCanEnableSaveRequiresTargetAndConsentAffirmation() {
        XCTAssertFalse(
            NutritionGoalsSavePolicy.canEnableSave(
                isSaving: false,
                isUnavailable: false,
                hasAnyValue: false,
                hasActiveGoalsConsent: false,
                affirmedGoalsConsent: true
            )
        )
        XCTAssertFalse(
            NutritionGoalsSavePolicy.canEnableSave(
                isSaving: false,
                isUnavailable: false,
                hasAnyValue: true,
                hasActiveGoalsConsent: false,
                affirmedGoalsConsent: false
            )
        )
        XCTAssertTrue(
            NutritionGoalsSavePolicy.canEnableSave(
                isSaving: false,
                isUnavailable: false,
                hasAnyValue: true,
                hasActiveGoalsConsent: false,
                affirmedGoalsConsent: true
            )
        )
        XCTAssertTrue(
            NutritionGoalsSavePolicy.canEnableSave(
                isSaving: false,
                isUnavailable: false,
                hasAnyValue: true,
                hasActiveGoalsConsent: true,
                affirmedGoalsConsent: false
            )
        )
    }

    func testHasActiveGoalsConsentRequiresPurposeAndState() {
        let statement = NutritionConsentStatement(
            purpose: .goals,
            policyVersion: "goals-2026-08-09.1",
            statementVersion: "1",
            text: "Statement",
            sha256: "abc",
            privacyNoticeVersion: "1"
        )
        let inactive = NutritionConsentStatus(
            purpose: .goals,
            state: .notGranted,
            consentId: nil,
            grantedAt: nil,
            withdrawnAt: nil,
            statement: statement
        )
        let active = NutritionConsentStatus(
            purpose: .goals,
            state: .active,
            consentId: "c1",
            grantedAt: nil,
            withdrawnAt: nil,
            statement: statement
        )
        let intakeActive = NutritionConsentStatus(
            purpose: .intake,
            state: .active,
            consentId: "c2",
            grantedAt: nil,
            withdrawnAt: nil,
            statement: NutritionConsentStatement(
                purpose: .intake,
                policyVersion: "intake-1",
                statementVersion: "1",
                text: "Statement",
                sha256: "abc",
                privacyNoticeVersion: "1"
            )
        )
        XCTAssertFalse(NutritionGoalsSavePolicy.hasActiveGoalsConsent(in: [inactive, intakeActive]))
        XCTAssertTrue(NutritionGoalsSavePolicy.hasActiveGoalsConsent(in: [active]))
    }
}
