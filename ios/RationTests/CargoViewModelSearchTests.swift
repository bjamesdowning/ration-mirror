import XCTest
@testable import Ration

final class CargoViewModelSearchTests: XCTestCase {
    @MainActor
    func testEditingSubmittedSearchRestoresLocalInventoryProjection() async throws {
        let organizationId = "org-search-\(UUID().uuidString)"
        let snapshots = SnapshotStore()
        defer { Task { await snapshots.clear(domain: SnapshotDomain.cargo, organizationId: organizationId) } }
        let page = try decodePage()
        await snapshots.save(page, domain: SnapshotDomain.cargo, organizationId: organizationId)

        let auth = AuthManager()
        let api = RationAPI(client: APIClient(auth: auth))
        let model = CargoViewModel()
        await model.reload(
            api: api,
            snapshots: snapshots,
            online: false,
            organizationId: organizationId
        )

        model.filters.search = "salt"
        model.applyClientFilters()
        model.applyRemoteSearchResults([])
        model.filters.search = ""
        model.applyClientFilters()

        guard case let .inventory(items) = model.listContent else {
            return XCTFail("Expected inventory after editing remote search")
        }
        XCTAssertEqual(items.map(\.name), ["salt", "pepper"])
        XCTAssertEqual(model.total, 2)
    }

    private func decodePage() throws -> CargoPage {
        let json = """
        {
          "items": [
            {
              "id": "cargo-salt",
              "organizationId": "org-search",
              "name": "salt",
              "quantity": 1,
              "unit": "box",
              "domain": "food",
              "tags": [],
              "status": "stable",
              "expiresAt": null,
              "createdAt": "2026-01-01T00:00:00Z",
              "updatedAt": "2026-01-01T00:00:00Z"
            },
            {
              "id": "cargo-pepper",
              "organizationId": "org-search",
              "name": "pepper",
              "quantity": 1,
              "unit": "jar",
              "domain": "food",
              "tags": [],
              "status": "stable",
              "expiresAt": null,
              "createdAt": "2026-01-01T00:00:00Z",
              "updatedAt": "2026-01-01T00:00:00Z"
            }
          ],
          "nextCursor": "cursor-2",
          "total": 2,
          "activeCargoIds": []
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(CargoPage.self, from: json)
    }
}
