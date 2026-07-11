import XCTest
@testable import Ration

@MainActor
final class OnboardingCoordinatorTests: XCTestCase {
    func testClampedStepBounds() {
        XCTAssertEqual(OnboardingCoordinator.clampedStep(-3), 0)
        XCTAssertEqual(OnboardingCoordinator.clampedStep(0), 0)
        XCTAssertEqual(OnboardingCoordinator.clampedStep(6), 6)
        XCTAssertEqual(OnboardingCoordinator.clampedStep(99), 6)
    }

    func testStartIfNeededResumesStepAndUnits() throws {
        let coordinator = OnboardingCoordinator()
        let settings = try decodeSettings(#"{"unitDisplayMode":"imperial","onboardingStep":3}"#)

        coordinator.startIfNeeded(completedAt: nil, initialStep: settings.onboardingStep, settings: settings)

        XCTAssertTrue(coordinator.isActive)
        XCTAssertEqual(coordinator.step, 3)
        XCTAssertEqual(coordinator.phase, .contextual)
        XCTAssertEqual(coordinator.unitDisplayMode, "imperial")
        XCTAssertEqual(coordinator.highlightedTab, 2)
    }

    func testStartIfNeededSkipsWhenCompleted() {
        let coordinator = OnboardingCoordinator()
        coordinator.startIfNeeded(completedAt: "2026-01-01T00:00:00Z", initialStep: 0)
        XCTAssertFalse(coordinator.isActive)
    }

    func testPhaseMapping() {
        let coordinator = OnboardingCoordinator()
        coordinator.restart(fromServerStep: 0)
        XCTAssertEqual(coordinator.phase, .welcome)

        coordinator.restart(fromServerStep: 2)
        XCTAssertEqual(coordinator.phase, .contextual)

        coordinator.restart(fromServerStep: 6)
        XCTAssertEqual(coordinator.phase, .launch)
    }

    func testGoBackPersistsPreviousStep() async throws {
        let coordinator = OnboardingCoordinator()
        coordinator.restart(fromServerStep: 4)
        var patchedStep: Int?
        coordinator.settingsPatchHandler = { patch in
            patchedStep = patch.onboardingStep
            return try self.decodeSettings("{}")
        }

        let settings = await coordinator.goBack(api: RationAPI(client: APIClient(auth: AuthManager())))

        XCTAssertNotNil(settings)
        XCTAssertEqual(patchedStep, 3)
        XCTAssertEqual(coordinator.step, 3)
    }

    func testSkipStaysActiveWhenPatchFails() async {
        let coordinator = OnboardingCoordinator()
        coordinator.restart(fromServerStep: 2)
        coordinator.settingsPatchHandler = { _ in
            throw APIError.server(status: 503, message: "busy", code: nil)
        }

        let result = await coordinator.skip(api: RationAPI(client: APIClient(auth: AuthManager())))

        XCTAssertNil(result)
        XCTAssertTrue(coordinator.isActive)
        XCTAssertEqual(coordinator.step, 2)
        XCTAssertNotNil(coordinator.errorMessage)
    }

    func testCompleteStaysActiveWhenPatchFails() async {
        let coordinator = OnboardingCoordinator()
        coordinator.restart(fromServerStep: 6)
        coordinator.settingsPatchHandler = { _ in
            throw APIError.server(status: 503, message: "busy", code: nil)
        }

        let result = await coordinator.complete(api: RationAPI(client: APIClient(auth: AuthManager())))

        XCTAssertNil(result)
        XCTAssertTrue(coordinator.isActive)
        XCTAssertEqual(coordinator.phase, .launch)
    }

    func testSkipFinishesWhenPatchSucceeds() async throws {
        let coordinator = OnboardingCoordinator()
        coordinator.restart(fromServerStep: 2)
        coordinator.settingsPatchHandler = { patch in
            XCTAssertNotNil(patch.onboardingCompletedAt)
            return try self.decodeSettings(#"{"onboardingCompletedAt":"2026-01-01T00:00:00Z"}"#)
        }

        let result = await coordinator.skip(api: RationAPI(client: APIClient(auth: AuthManager())))

        XCTAssertNotNil(result)
        XCTAssertFalse(coordinator.isActive)
    }

    func testRestartActivatesTourAtStepZero() {
        let coordinator = OnboardingCoordinator()
        coordinator.reset()
        coordinator.restart(fromServerStep: 0)
        XCTAssertTrue(coordinator.isActive)
        XCTAssertEqual(coordinator.step, 0)
        XCTAssertEqual(coordinator.phase, .welcome)
    }

    func testContextualCopyCoverage() {
        for step in 1...5 {
            XCTAssertNotNil(OnboardingCopy.contextualStep(for: step))
        }
        XCTAssertNil(OnboardingCopy.contextualStep(for: 0))
        XCTAssertNil(OnboardingCopy.contextualStep(for: 6))
    }

    func testFreeTierListsMatchServerLimits() {
        let free = OnboardingCopy.tiers.first { $0.id == "free" }
        XCTAssertEqual(free?.features.contains("3 Supply lists"), true)
    }

    private func decodeSettings(_ json: String) throws -> UserSettings {
        try JSONDecoder().decode(UserSettings.self, from: Data(json.utf8))
    }
}

@MainActor
final class LaunchCoordinatorOnboardingTests: XCTestCase {
    func testInitialOnboardingStepClampsServerValue() async throws {
        let launch = LaunchCoordinator()
        let settings = try JSONDecoder().decode(
            UserSettings.self,
            from: Data(#"{"onboardingStep":99}"#.utf8)
        )

        await launch.performStartup(
            loadSession: { true },
            loadSettings: { settings },
            applySettings: { _ in }
        )

        XCTAssertEqual(launch.initialOnboardingStep, 6)
    }
}
