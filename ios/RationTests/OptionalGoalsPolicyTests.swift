import XCTest
@testable import Ration

@MainActor
final class OptionalGoalsPolicyTests: XCTestCase {
    func testStepStaysHiddenUntilMacroTrackingAndAFlagAllowIt() {
        XCTAssertFalse(
            OptionalGoalsPolicy.stepVisible(
                macroTrackingOn: false,
                fastLogEnabled: true,
                goalsEnabled: true,
                appVersion: "1.6.0"
            )
        )
        XCTAssertFalse(
            OptionalGoalsPolicy.stepVisible(
                macroTrackingOn: true,
                fastLogEnabled: false,
                goalsEnabled: false,
                appVersion: "1.6.0"
            )
        )
        XCTAssertTrue(
            OptionalGoalsPolicy.stepVisible(
                macroTrackingOn: true,
                fastLogEnabled: true,
                goalsEnabled: false,
                appVersion: "1.6.0"
            )
        )
        XCTAssertTrue(
            OptionalGoalsPolicy.stepVisible(
                macroTrackingOn: true,
                fastLogEnabled: false,
                goalsEnabled: true,
                appVersion: "1.6.0"
            )
        )
    }

    func testIOSBelow16FailsClosed() {
        XCTAssertFalse(
            OptionalGoalsPolicy.stepVisible(
                macroTrackingOn: true,
                fastLogEnabled: true,
                goalsEnabled: true,
                appVersion: "1.5.21"
            )
        )
    }

    func testSkipAndEmptyFieldsWriteNothing() {
        XCTAssertNil(
            OptionalGoalsPolicy.write(
                dailyEnergyKcal: "",
                proteinG: " ",
                carbsG: "",
                fatG: "",
                fiberG: "",
                goalsEnabled: true
            )
        )
        XCTAssertNil(
            OptionalGoalsPolicy.write(
                dailyEnergyKcal: "",
                proteinG: "90",
                carbsG: "",
                fatG: "",
                fiberG: "",
                goalsEnabled: false
            )
        )
        let stated = OptionalGoalsPolicy.write(
            dailyEnergyKcal: "",
            proteinG: "90",
            carbsG: "",
            fatG: "",
            fiberG: "",
            goalsEnabled: true
        )
        XCTAssertEqual(stated?.protein, 90)
        XCTAssertNil(stated?.energy)
        XCTAssertEqual(OptionalGoalsPolicy.draftCopy, "Enter targets you already use")
        XCTAssertFalse(OptionalGoalsPolicy.draftCopy.contains(where: \.isNumber))
    }

    func testOfferedStepThenSkipDoesNotChangeTheBriefingPath() {
        let coordinator = OnboardingCoordinator()
        coordinator.startIfNeeded(completedAt: nil)
        coordinator.advanceFromWelcome()
        coordinator.advanceFromFeatureEnablement(aiEnabled: true, offerOptionalGoals: true)
        XCTAssertEqual(coordinator.phase, .optionalGoals)
        coordinator.advanceFromOptionalGoals()
        XCTAssertEqual(coordinator.phase, .askBriefing)
        XCTAssertFalse(coordinator.shouldUseStaticBriefing)
    }
}
