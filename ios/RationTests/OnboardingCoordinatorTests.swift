import XCTest
@testable import Ration

@MainActor
final class OnboardingCoordinatorTests: XCTestCase {
    func testStartIfNeededActivatesBriefing() throws {
        let coordinator = OnboardingCoordinator()
        let settings = try decodeSettings(#"{"unitDisplayMode":"imperial"}"#)

        coordinator.startIfNeeded(completedAt: nil, settings: settings)

        XCTAssertTrue(coordinator.isActive)
        XCTAssertEqual(coordinator.phase, .askBriefing)
        XCTAssertEqual(coordinator.unitDisplayMode, "imperial")
        XCTAssertFalse(coordinator.isStaticReplay)
    }

    func testStartIfNeededSkipsWhenCompleted() {
        let coordinator = OnboardingCoordinator()
        coordinator.startIfNeeded(completedAt: "2026-01-01T00:00:00Z")
        XCTAssertFalse(coordinator.isActive)
    }

    func testRestartUsesStaticReplay() {
        let coordinator = OnboardingCoordinator()
        coordinator.reset()
        coordinator.restart(staticReplay: true)
        XCTAssertTrue(coordinator.isActive)
        XCTAssertTrue(coordinator.isStaticReplay)
        XCTAssertEqual(coordinator.phase, .askBriefing)
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
    }

    func testDefaultUnitDisplayModeUsesLocale() {
        _ = OnboardingCoordinator.defaultUnitDisplayMode()
    }

    private func decodeSettings(_ json: String) throws -> UserSettings {
        try JSONDecoder().decode(UserSettings.self, from: Data(json.utf8))
    }
}

@MainActor
final class LaunchCoordinatorOnboardingTests: XCTestCase {
    func testNeedsOnboardingWhenCompletionMissing() async throws {
        let launch = LaunchCoordinator()
        let settings = try JSONDecoder().decode(
            UserSettings.self,
            from: Data(#"{"onboardingStep":0}"#.utf8)
        )

        await launch.performStartup(
            loadSession: { true },
            loadSettings: { settings },
            applySettings: { _ in }
        )

        XCTAssertTrue(launch.needsOnboarding)
    }
}
