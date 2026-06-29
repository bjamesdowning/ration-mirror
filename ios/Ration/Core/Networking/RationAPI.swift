import Foundation

/// Typed facade over `APIClient` — one method per `/api/mobile/v1` route used by the app.
@MainActor
final class RationAPI {
    let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    // Session / org
    func session() async throws -> SessionResponse {
        try await client.get("session")
    }

    func activateOrg(_ id: String) async throws -> TokenPair {
        try await client.post("orgs/\(id)/activate", body: EmptyBody())
    }

    func deleteAccount() async throws -> AccountDeleteResponse {
        try await client.delete("account")
    }

    // Settings
    func settings() async throws -> SettingsResponse {
        try await client.get("settings")
    }

    func patchSettings(_ patch: SettingsPatch) async throws -> SettingsResponse {
        try await client.patch("settings", body: patch)
    }

    // Dashboard
    func dashboard() async throws -> DashboardResponse {
        try await client.get("dashboard")
    }

    // Cargo
    func cargo(cursor: String? = nil, domain: CargoDomain? = nil, limit: Int = 50) async throws -> CargoPage {
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
        if let domain { query.append(URLQueryItem(name: "domain", value: domain.rawValue)) }
        return try await client.get("cargo", query: query)
    }

    func cargoItem(id: String) async throws -> CargoDetailResponse {
        try await client.get("cargo/\(id)")
    }

    func createCargo(_ body: CreateCargoRequest) async throws -> CreateCargoResponse {
        try await client.post("cargo", body: body)
    }

    func updateCargo(id: String, _ body: UpdateCargoRequest) async throws -> CargoDetailResponse {
        try await client.patch("cargo/\(id)", body: body)
    }

    func deleteCargo(_ id: String) async throws {
        let _: EmptyResponse = try await client.delete("cargo/\(id)")
    }

    func batchAddCargo(_ body: BatchCargoRequest) async throws -> BatchCargoResponse {
        try await client.post("cargo/batch", body: body)
    }

    func search(query: String) async throws -> SearchResponse {
        try await client.get("search", query: [URLQueryItem(name: "q", value: query)])
    }

    // Supply
    func supply() async throws -> SupplyResponse {
        try await client.get("supply")
    }

    func toggleSupplyItem(_ id: String, isPurchased: Bool) async throws -> EmptyResponse {
        try await client.patch("supply/items/\(id)", body: ["isPurchased": isPurchased])
    }

    func syncSupply() async throws -> SupplySyncResponse {
        try await client.post("supply/sync", body: EmptyBody())
    }

    func completeSupply(listId: String) async throws -> SupplyCompleteResponse {
        try await client.post("supply/complete", body: SupplyCompleteRequest(listId: listId))
    }

    // Galley
    func meals(limit: Int = 50, tag: String? = nil) async throws -> MealsResponse {
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let tag, !tag.isEmpty { query.append(URLQueryItem(name: "tag", value: tag)) }
        return try await client.get("meals", query: query)
    }

    func meal(id: String) async throws -> MealDetailResponse {
        try await client.get("meals/\(id)")
    }

    func matchMeals(mode: String = "delta", limit: Int = 20) async throws -> MealMatchResponse {
        try await client.get(
            "meals/match",
            query: [
                URLQueryItem(name: "mode", value: mode),
                URLQueryItem(name: "limit", value: String(limit)),
            ]
        )
    }

    func cookMeal(id: String, servings: Int? = nil) async throws -> CookMealResponse {
        if let servings {
            return try await client.post("meals/\(id)/cook", body: ["servings": servings])
        }
        return try await client.post("meals/\(id)/cook", body: EmptyBody())
    }

    func toggleMealActive(id: String) async throws -> ToggleActiveResponse {
        try await client.post("meals/\(id)/toggle-active", body: EmptyBody())
    }

    // Manifest
    func manifest(startDate: String? = nil, endDate: String? = nil) async throws -> ManifestResponse {
        var query: [URLQueryItem] = []
        if let startDate { query.append(URLQueryItem(name: "startDate", value: startDate)) }
        if let endDate { query.append(URLQueryItem(name: "endDate", value: endDate)) }
        return try await client.get("manifest", query: query)
    }

    func addManifestEntry(_ entry: ManifestEntryCreate) async throws -> ManifestEntryCreateResponse {
        try await client.post("manifest", body: entry)
    }

    func consumeManifestEntries(_ entryIds: [String]) async throws -> ManifestConsumeResponse {
        try await client.post("manifest/consume", body: ManifestConsumeRequest(entryIds: entryIds))
    }

    // Billing
    func billingStatus() async throws -> BillingStatus {
        try await client.get("billing/status")
    }

    // Scan
    func submitScan(imageData: Data) async throws -> ScanSubmitResponse {
        try await client.uploadImage("scan", imageData: imageData)
    }

    func scanStatus(requestId: String) async throws -> ScanStatusResponse {
        try await client.get("scan/\(requestId)")
    }
}

struct EmptyBody: Encodable, Sendable {}

struct EmptyResponse: Decodable, Sendable {
    init() {}
    init(from decoder: Decoder) throws {}
}
