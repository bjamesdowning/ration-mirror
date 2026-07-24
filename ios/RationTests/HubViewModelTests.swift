import XCTest
@testable import Ration

@MainActor
final class HubViewModelTests: XCTestCase {
    func testResolvedLayoutEmptyWhileLoading() {
        let model = HubViewModel()
        XCTAssertTrue(model.resolvedLayout.isEmpty)
    }

    func testOfflineWithoutCacheFails() async {
        let model = HubViewModel()
        let snapshots = SnapshotStore()
        let api = RationAPI(client: APIClient(auth: AuthManager()))
        await model.load(
            api: api,
            snapshots: snapshots,
            online: false,
            organizationId: "org-test"
        )
        guard case let .failed(message) = model.state else {
            return XCTFail("expected failed state, got \(model.state)")
        }
        XCTAssertTrue(message.lowercased().contains("offline"))
    }

    func testCancelledColdLoadLeavesFailedNotStuckLoading() async {
        let model = HubViewModel()
        model.fetchHubForTesting = { throw CancellationError() }
        let snapshots = SnapshotStore()
        let api = RationAPI(client: APIClient(auth: AuthManager()))
        await model.load(
            api: api,
            snapshots: snapshots,
            online: true,
            organizationId: "org-cancel-\(UUID().uuidString)"
        )
        guard case let .failed(message) = model.state else {
            return XCTFail("expected failed state after cancel, got \(model.state)")
        }
        XCTAssertTrue(message.lowercased().contains("couldn't load hub"))
    }

    func testLoadedLayoutResolvesFromProfile() throws {
        let model = HubViewModel()
        let data = try makeHubResponse(profile: "cook")
        model.setLoadedForTesting(data)
        // Preset profiles always resolve to a non-empty widget set.
        XCTAssertFalse(model.resolvedLayout.isEmpty)
    }

    private func makeHubResponse(profile: String) throws -> HubResponse {
        let json = """
        {
          "expiringItems": [],
          "cargoStats": {
            "totalItems": 10,
            "expiringCount": 0,
            "expiredCount": 0
          },
          "latestSupplyList": null,
          "manifestPreview": null,
          "expirationAlertDays": 7,
          "hubProfile": "\(profile)",
          "hubLayout": null,
          "availableMealTags": [],
          "availableCargoTags": null,
          "cargoTagIndex": null,
          "mealMatches": [],
          "partialMealMatches": [],
          "snackMatches": []
        }
        """
        return try JSON.decoder.decode(HubResponse.self, from: Data(json.utf8))
    }
}
