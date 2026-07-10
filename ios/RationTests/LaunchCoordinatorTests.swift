import XCTest
@testable import Ration

final class LaunchCoordinatorTests: XCTestCase {
    @MainActor
    func testSettingsFailureDoesNotForceOnboarding() async {
        let launch = LaunchCoordinator()
        await launch.performStartup(
            loadSession: { true },
            loadSettings: { nil },
            applySettings: { _ in XCTFail("Settings must not apply on failure") }
        )

        guard case .failed = launch.phase else {
            return XCTFail("Expected failed startup")
        }
        XCTAssertFalse(launch.isStartupComplete)
        XCTAssertFalse(launch.needsOnboarding)
    }

    @MainActor
    func testSuccessfulStartupAppliesSettingsAndBecomesReady() async throws {
        let launch = LaunchCoordinator()
        let settings = try decodeSettings("{}")
        var didApply = false

        await launch.performStartup(
            loadSession: { true },
            loadSettings: { settings },
            applySettings: { _ in didApply = true }
        )

        XCTAssertEqual(launch.phase, .ready)
        XCTAssertTrue(launch.isStartupComplete)
        XCTAssertTrue(launch.needsOnboarding)
        XCTAssertTrue(didApply)
    }

    @MainActor
    func testResetRejectsStaleStartupCompletion() async throws {
        let launch = LaunchCoordinator()
        let settings = try decodeSettings("{}")
        let task = Task {
            await launch.performStartup(
                loadSession: {
                    try? await Task.sleep(nanoseconds: 50_000_000)
                    return true
                },
                loadSettings: { settings },
                applySettings: { _ in XCTFail("Stale settings must not apply") }
            )
        }

        try? await Task.sleep(nanoseconds: 5_000_000)
        launch.reset()
        await task.value

        XCTAssertEqual(launch.phase, .idle)
        XCTAssertNil(launch.userSettings)
    }

    private func decodeSettings(_ json: String) throws -> UserSettings {
        try JSONDecoder().decode(UserSettings.self, from: Data(json.utf8))
    }
}

final class DeepLinkRouterTests: XCTestCase {
    @MainActor
    func testReplayPendingOpensGalleyGenerate() {
        let router = DeepLinkRouter()
        router.enqueue(.galleyGenerate)
        var selectedTab = 0
        router.replayPending(
            selectedTab: &selectedTab,
            openAskSheet: {},
            openScan: {}
        )
        XCTAssertEqual(selectedTab, 2)
        XCTAssertTrue(router.galleyGeneratePending)
        XCTAssertNil(router.pending)
    }

    @MainActor
    func testQueuedDestinationsReplayInOrder() {
        let router = DeepLinkRouter()
        router.enqueue(.ask)
        router.enqueue(.scan)
        var selectedTab = 0
        var actions: [String] = []

        router.replayPending(
            selectedTab: &selectedTab,
            openAskSheet: { actions.append("ask") },
            openScan: { actions.append("scan") }
        )
        XCTAssertEqual(router.pending, .scan)

        router.replayPending(
            selectedTab: &selectedTab,
            openAskSheet: { actions.append("ask") },
            openScan: { actions.append("scan") }
        )
        XCTAssertEqual(actions, ["ask", "scan"])
        XCTAssertNil(router.pending)
    }
}
