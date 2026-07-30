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

    func testFullLayoutIncludesFlightRecorder() {
        XCTAssertTrue(
            HubWidgetRegistry.fullLayout.contains {
                $0.id == HubWidgetID.flightRecorder.rawValue && $0.visible
            }
        )
    }

    func testFlightRecorderActivityDecodesFromMobileContract() throws {
        let json = """
        {
          "stats": {
            "window": "7d",
            "from": "2026-07-24T00:00:00.000Z",
            "to": "2026-07-31T00:00:00.000Z",
            "countsByType": { "cargo_jettisoned": 1 },
            "totals": {
              "cooked": 0,
              "docked": 0,
              "expired": 0,
              "jettisoned": 1
            }
          },
          "recent": [
            {
              "id": "event-1",
              "eventType": "cargo_jettisoned",
              "occurredAt": "2026-07-30T12:00:00.000Z",
              "subjectName": "Milk",
              "mealId": null,
              "cargoId": null
            }
          ]
        }
        """

        let activity = try JSON.decoder.decode(
            FlightRecorderActivity.self,
            from: Data(json.utf8)
        )
        XCTAssertEqual(activity.stats.totals.jettisoned, 1)
        XCTAssertEqual(activity.recent.first?.subjectName, "Milk")
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
