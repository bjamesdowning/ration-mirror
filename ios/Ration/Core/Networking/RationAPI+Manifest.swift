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
    func manifestPlannedDates(
        from: String,
        to: String,
        intake: String? = nil
    ) async throws -> ManifestPlannedDatesResponse {
        var query = [
            URLQueryItem(name: "from", value: from),
            URLQueryItem(name: "to", value: to),
        ]
        if let intake {
            query.append(URLQueryItem(name: "intake", value: intake))
        }
        return try await client.get("manifest/planned-dates", query: query)
    }

    func bulkManifest(_ body: BulkManifestRequest) async throws -> BulkManifestResponse {
        try await client.post("manifest/bulk", body: body)
    }

    func deleteManifestEntry(_ entryId: String) async throws -> ManifestEntryDeleteResponse {
        try await client.delete("manifest/entries/\(entryId)")
    }

    // Cook — shared, org-scoped Cargo/preparation mutation.
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
        let body = ManifestIntakeUpsertRequest(
            servings: servings,
            amount: amount,
            unit: unit,
            idempotencyKey: idempotencyKey,
            notes: notes,
            fuelTimeZone: FuelDeviceZone.candidate
        )
        do {
            return try await client.post("manifest/entries/\(entryId)/intake", body: body)
        } catch let error as APIError where error.code == "fuel_timezone_required" {
            guard let zone = FuelDeviceZone.candidate else { throw error }
            _ = try await patchSettings(SettingsPatch(fuelTimeZone: zone))
            return try await client.post("manifest/entries/\(entryId)/intake", body: body)
        }
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

    func updateManifestEntry(
        id: String,
        date: String,
        slotType: String,
        servingsOverride: Int
    ) async throws -> ManifestEntryCreateResponse {
        try await client.patch(
            "manifest/entries/\(id)",
            body: ManifestEntryUpdateBody(date: date, slotType: slotType, servingsOverride: servingsOverride)
        )
    }

    func addCargoLine(
        cargoId: String,
        date: String,
        slotType: String,
        quantity: Double
    ) async throws -> CargoLineResponse {
        try await client.post(
            "manifest/cargo-lines",
            body: CargoLineCreateBody(cargoId: cargoId, date: date, slotType: slotType, quantity: quantity)
        )
    }

    func cookCargoLine(id: String) async throws -> CargoLineCookResponse {
        try await client.post("manifest/cargo-lines/\(id)/cook", body: EmptyBody())
    }

    func addCargoToFuel(id: String, quantity: Double) async throws -> CargoFuelResponse {
        let key = UUID().uuidString
        return try await client.post(
            "cargo/\(id)/add-to-fuel",
            body: FuelWriteBody(quantity: quantity, operationKey: key, idempotencyKey: key, occurredAt: Self.nowStamp())
        )
    }

    func addMealToFuel(id: String, servings: Double, confirmInsufficient: Bool) async throws -> MealFuelResponse {
        let key = UUID().uuidString
        return try await client.post(
            "meals/\(id)/add-to-fuel",
            body: MealFuelBody(
                servings: servings,
                confirmInsufficient: confirmInsufficient,
                operationKey: key,
                idempotencyKey: key,
                occurredAt: Self.nowStamp()
            )
        )
    }

    private static func nowStamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

private struct ManifestEntryUpdateBody: Encodable {
    let date: String
    let slotType: String
    let servingsOverride: Int
}

private struct CargoLineCreateBody: Encodable {
    let cargoId: String
    let date: String
    let slotType: String
    let quantity: Double
}

struct CargoLineResponse: Decodable {
    let line: ManifestCargoLine
}

struct CargoLineCookResponse: Decodable {
    let line: ManifestCargoLine
    let alreadyCooked: Bool
}

private struct FuelWriteBody: Encodable {
    let quantity: Double
    let operationKey: String
    let idempotencyKey: String
    let occurredAt: String
}

struct CargoFuelResponse: Decodable {
    let intakeId: String
    let cargoId: String
}

private struct MealFuelBody: Encodable {
    let servings: Double
    let confirmInsufficient: Bool
    let operationKey: String
    let idempotencyKey: String
    let occurredAt: String
}

struct MealFuelResponse: Decodable {
    let intakeId: String?
    let mealId: String?
    let requiresConfirmation: Bool?
}
