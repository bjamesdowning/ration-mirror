import Foundation

extension RationAPI {
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

    func consumeManifestEntries(
        _ entryIds: [String],
        confirmInsufficient: Bool? = nil
    ) async throws -> ManifestConsumeResponse {
        try await client.post(
            "manifest/consume",
            body: ManifestConsumeRequest(entryIds: entryIds, confirmInsufficient: confirmInsufficient)
        )
    }

    func toggleManifestDaySupply(date: String) async throws -> ManifestSupplyDayToggleResponse {
        try await client.post("manifest/supply-days/\(date)", body: EmptyBody())
    }

    func undoAction(token: String) async throws -> UndoActionResponse {
        try await client.post("undo", body: UndoActionRequest(token: token))
    }

    func planWeek(_ body: PlanWeekRequest) async throws -> AIJobSubmitResponse {
        try await client.post("manifest/plan-week", body: body)
    }

    func planWeekStatus(requestId: String) async throws -> PlanWeekStatusResponse {
        try await client.get("manifest/plan-week/\(requestId)")
    }

    func bulkManifest(_ body: BulkManifestRequest) async throws -> BulkManifestResponse {
        try await client.post("manifest/bulk", body: body)
    }

    func deleteManifestEntry(_ entryId: String) async throws -> ManifestEntryDeleteResponse {
        try await client.delete("manifest/entries/\(entryId)")
    }

}
