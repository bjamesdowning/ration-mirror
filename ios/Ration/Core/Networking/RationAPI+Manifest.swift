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

    /// Month-scoped planned (and optional intake) calendar markers.
    func manifestPlannedDates(from: String, to: String) async throws -> ManifestPlannedDatesResponse {
        try await client.get(
            "manifest/planned-dates",
            query: [
                URLQueryItem(name: "from", value: from),
                URLQueryItem(name: "to", value: to),
            ]
        )
    }

    func bulkManifest(_ body: BulkManifestRequest) async throws -> BulkManifestResponse {
        try await client.post("manifest/bulk", body: body)
    }

    func deleteManifestEntry(_ entryId: String) async throws -> ManifestEntryDeleteResponse {
        try await client.delete("manifest/entries/\(entryId)")
    }

    // Cook — shared, org-scoped Cargo/preparation mutation (nutrition-cook-log-split).
    func cookManifestEntries(
        _ entryIds: [String],
        confirmInsufficient: Bool? = nil
    ) async throws -> CookEntriesResponse {
        try await client.post(
            "manifest/cook",
            body: CookEntriesRequest(entryIds: entryIds, confirmInsufficient: confirmInsufficient)
        )
    }

    // Eat — private personal intake upsert/clear. Entry must be cooked first.
    func upsertManifestIntake(
        entryId: String,
        servings: Double,
        idempotencyKey: String,
        notes: String? = nil,
        amount: Double? = nil,
        unit: IntakeLoggedUnit? = nil
    ) async throws -> ManifestIntakeUpsertResponse {
        try await client.post(
            "manifest/entries/\(entryId)/intake",
            body: ManifestIntakeUpsertRequest(
                servings: servings,
                amount: amount,
                unit: unit,
                idempotencyKey: idempotencyKey,
                notes: notes
            )
        )
    }

    func clearManifestIntake(
        entryId: String,
        operationKey: String = UUID().uuidString
    ) async throws -> ManifestIntakeClearResponse {
        try await client.delete(
            "manifest/entries/\(entryId)/intake",
            query: [URLQueryItem(name: "operationKey", value: operationKey)]
        )
    }
}
