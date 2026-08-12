import XCTest
@testable import Ration

@MainActor
final class OnboardingCoordinatorTests: XCTestCase {
    func testStartIfNeededStartsAtWelcome() throws {
        let coordinator = OnboardingCoordinator()
        let settings = try decodeSettings(#"{"unitDisplayMode":"imperial"}"#)

        coordinator.startIfNeeded(completedAt: nil, settings: settings)

        XCTAssertTrue(coordinator.isActive)
        XCTAssertEqual(coordinator.phase, .welcome)
        XCTAssertEqual(coordinator.unitDisplayMode, "imperial")
        XCTAssertFalse(coordinator.isStaticReplay)
    }

    func testAdvanceWelcomeThenFeaturesThenBriefing() {
        let coordinator = OnboardingCoordinator()
        coordinator.startIfNeeded(completedAt: nil)

        coordinator.advanceFromWelcome(featureEnablementEnabled: true)
        XCTAssertEqual(coordinator.phase, .featureEnablement)

        coordinator.advanceFromFeatureEnablement(aiEnabled: true)
        XCTAssertEqual(coordinator.phase, .askBriefing)
        XCTAssertFalse(coordinator.shouldUseStaticBriefing)
    }

    func testAdvanceWelcomeSkipsFeaturesWhenFlagOff() {
        let coordinator = OnboardingCoordinator()
        coordinator.startIfNeeded(completedAt: nil)
        coordinator.advanceFromWelcome(featureEnablementEnabled: false)
        XCTAssertEqual(coordinator.phase, .askBriefing)
    }

    func testFeatureEnablementWithAIOffUsesStaticBriefing() {
        let coordinator = OnboardingCoordinator()
        coordinator.startIfNeeded(completedAt: nil)
        coordinator.advanceFromWelcome(featureEnablementEnabled: true)
        coordinator.advanceFromFeatureEnablement(aiEnabled: false)

        XCTAssertEqual(coordinator.phase, .askBriefing)
        XCTAssertTrue(coordinator.shouldUseStaticBriefing)
        XCTAssertTrue(coordinator.isStaticReplay)
    }

    func testStartIfNeededSkipsWhenCompleted() {
        let coordinator = OnboardingCoordinator()
        coordinator.startIfNeeded(completedAt: "2026-01-01T00:00:00Z")
        XCTAssertFalse(coordinator.isActive)
        XCTAssertEqual(coordinator.phase, .inactive)
    }

    func testRestartUsesStaticReplayAndSkipsConsent() {
        let coordinator = OnboardingCoordinator()
        coordinator.reset()
        coordinator.restart(staticReplay: true)
        XCTAssertTrue(coordinator.isActive)
        XCTAssertTrue(coordinator.isStaticReplay)
        XCTAssertEqual(coordinator.phase, .askBriefing)
    }

    func testPreferStaticBriefingWhileActive() {
        let coordinator = OnboardingCoordinator()
        coordinator.startIfNeeded(completedAt: nil)
        XCTAssertFalse(coordinator.isStaticReplay)
        coordinator.preferStaticBriefing()
        XCTAssertTrue(coordinator.isStaticReplay)
        XCTAssertTrue(coordinator.isActive)
    }

    func testPreferStaticBriefingNoopsWhenInactive() {
        let coordinator = OnboardingCoordinator()
        coordinator.preferStaticBriefing()
        XCTAssertFalse(coordinator.isActive)
        XCTAssertFalse(coordinator.isStaticReplay)
    }

    func testCompleteFinishesLocally() async throws {
        let coordinator = OnboardingCoordinator()
        coordinator.startIfNeeded(completedAt: nil, settings: nil)
        coordinator.settingsPatchHandler = { patch in
            XCTAssertNotNil(patch.onboardingCompletedAt)
            return try self.decodeSettings(#"{"onboardingCompletedAt":"2026-01-01T00:00:00Z"}"#)
        }

        let result = await coordinator.complete(api: RationAPI(client: APIClient(auth: AuthManager())))

        XCTAssertNotNil(result)
        XCTAssertFalse(coordinator.isActive)
        XCTAssertEqual(coordinator.phase, .inactive)
    }

    func testDefaultUnitDisplayModeUsesLocale() {
        _ = OnboardingCoordinator.defaultUnitDisplayMode()
    }

    private func decodeSettings(_ json: String) throws -> UserSettings {
        try JSONDecoder().decode(UserSettings.self, from: Data(json.utf8))
    }
}
