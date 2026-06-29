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

    /// Activating an org rebinds the org claim into the JWT, so the server
    /// returns a fresh token pair (and revokes prior refresh families). Callers
    /// must hand the pair to `AuthManager.adopt(_:)` before further requests.
    func activateOrg(_ id: String) async throws -> TokenPair {
        try await client.post("orgs/\(id)/activate", body: EmptyBody())
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

    func createCargo(_ body: CreateCargoRequest) async throws -> CreateCargoResponse {
        try await client.post("cargo", body: body)
    }

    func deleteCargo(_ id: String) async throws {
        let _: EmptyResponse = try await client.delete("cargo/\(id)")
    }

    // Supply
    func supply() async throws -> SupplyResponse {
        try await client.get("supply")
    }

    func toggleSupplyItem(_ id: String, isPurchased: Bool) async throws -> EmptyResponse {
        try await client.patch("supply/items/\(id)", body: ["isPurchased": isPurchased])
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

/// For endpoints whose body we don't need to read.
struct EmptyResponse: Decodable, Sendable {
    init() {}
    init(from decoder: Decoder) throws {}
}
