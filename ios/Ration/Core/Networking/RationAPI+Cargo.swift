import Foundation

extension RationAPI {
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

    func toggleCargoRestock(id: String, quantity: Double? = nil) async throws -> ToggleCargoRestockResponse {
        if let quantity {
            return try await client.post(
                "cargo/\(id)/toggle-restock",
                body: CargoRestockBody(quantity: quantity)
            )
        }
        return try await client.post("cargo/\(id)/toggle-restock", body: EmptyBody())
    }

    func clearCargoSelections() async throws -> ClearSelectionsResponse {
        try await client.post("cargo/clear-selections", body: EmptyBody())
    }

    func batchAddCargo(_ body: BatchCargoRequest) async throws -> BatchCargoResponse {
        try await client.post("cargo/batch", body: body)
    }

    func search(query: String) async throws -> SearchResponse {
        try await client.get("search", query: [URLQueryItem(name: "q", value: query)])
    }

    func cargoTags() async throws -> TagsResponse {
        try await client.get("cargo/tags")
    }

    func organizationTags() async throws -> OrganizationTagsResponse {
        try await client.get("tags")
    }

    func createOrganizationTag(_ body: CreateTagRequest) async throws -> TagMutationResponse {
        try await client.post("tags", body: body)
    }

    func updateOrganizationTag(id: String, _ body: UpdateTagRequest) async throws -> TagMutationResponse {
        try await client.patch("tags/\(id)", body: body)
    }

    func deleteOrganizationTag(id: String) async throws {
        let _: EmptyResponse = try await client.delete("tags/\(id)")
    }

    func mergeOrganizationTag(id: String, targetId: String) async throws -> TagMutationResponse {
        try await client.post("tags/\(id)/merge", body: MergeTagRequest(targetId: targetId))
    }

    func cargoTagIndex() async throws -> CargoTagIndexResponse {
        try await client.get("cargo/tag-index")
    }
}
