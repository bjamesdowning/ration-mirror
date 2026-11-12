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
        try await client.post(CargoManifestRoutes.cookPath(id), body: EmptyBody())
    }

    func updateCargoLine(
        id: String,
        date: String,
        slotType: String,
        quantity: Double
    ) async throws -> CargoLineResponse {
        try await client.patch(
            CargoManifestRoutes.linePath(id),
            body: CargoLineUpdateBody(date: date, slotType: slotType, quantity: quantity)
        )
    }

    /// Removes the plan row only. Does not restore a cook and does not void a Fuel log.
    func deleteCargoLine(id: String) async throws -> CargoLineDeleteResponse {
        try await client.delete(CargoManifestRoutes.linePath(id))
    }

    func addCargoToFuel(
        id: String,
        quantity: Double,
        operationKey: String,
        notes: String? = nil,
        energyKcal: Double? = nil
    ) async throws -> CargoFuelResponse {
        let body = FuelWriteBody(
            quantity: quantity,
            operationKey: operationKey,
            idempotencyKey: operationKey,
            occurredAt: Self.nowStamp(),
            fuelTimeZone: FuelDeviceZone.candidate,
            notes: notes,
            energyKcal: energyKcal
        )
        return try await postAddingFuelZone("cargo/\(id)/add-to-fuel", body: body)
    }

    func addMealToFuel(
        id: String,
        servings: Double,
        operationKey: String,
        confirmInsufficient: Bool,
        notes: String? = nil,
        energyKcal: Double? = nil
    ) async throws -> MealFuelResult {
        let body = MealFuelBody(
            servings: servings,
            confirmInsufficient: confirmInsufficient,
            operationKey: operationKey,
            idempotencyKey: operationKey,
            occurredAt: Self.nowStamp(),
            fuelTimeZone: FuelDeviceZone.candidate,
            notes: notes,
            energyKcal: energyKcal
        )
        return try await postAddingFuelZone("meals/\(id)/add-to-fuel", body: body)
    }

    /// One retry after the device zone is saved. A second `fuel_timezone_required` is returned as-is.
    private func postAddingFuelZone<T: Decodable>(
        _ path: String,
        body: some Encodable
    ) async throws -> T {
        do {
            return try await client.post(path, body: body)
        } catch let error as APIError where error.code == "fuel_timezone_required" {
            guard let zone = FuelDeviceZone.candidate else { throw error }
            _ = try await patchSettings(SettingsPatch(fuelTimeZone: zone))
            return try await client.post(path, body: body)
        }
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

private struct CargoLineUpdateBody: Encodable {
    let date: String
    let slotType: String
    let quantity: Double
}

struct CargoLineResponse: Decodable {
    let line: ManifestCargoLine
}

struct CargoLineDeleteResponse: Decodable, Sendable {
    let deleted: Bool
}

struct CargoLineCookResponse: Decodable {
    let line: ManifestCargoLine
    let alreadyCooked: Bool
    let undoToken: String?
}

private struct FuelWriteBody: Encodable {
    let quantity: Double
    let operationKey: String
    let idempotencyKey: String
    let occurredAt: String
    let fuelTimeZone: String?
    let notes: String?
    let energyKcal: Double?

    enum CodingKeys: String, CodingKey {
        case quantity, operationKey, idempotencyKey, occurredAt, fuelTimeZone, notes, energyKcal
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(quantity, forKey: .quantity)
        try container.encode(operationKey, forKey: .operationKey)
        try container.encode(idempotencyKey, forKey: .idempotencyKey)
        try container.encode(occurredAt, forKey: .occurredAt)
        try container.encodeIfPresent(fuelTimeZone, forKey: .fuelTimeZone)
        try container.encodeIfPresent(notes, forKey: .notes)
        try container.encodeIfPresent(energyKcal, forKey: .energyKcal)
    }
}

struct CargoFuelResponse: Decodable, Equatable, Sendable {
    let intakeId: String
    let deducted: Double?
    let undoToken: String?

    enum CodingKeys: String, CodingKey {
        case intakeId, deducted, undoToken
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let intakeId = try container.decode(String.self, forKey: .intakeId)
        guard !intakeId.isEmpty else {
            throw DecodingError.dataCorruptedError(
                forKey: .intakeId,
                in: container,
                debugDescription: "intakeId is empty"
            )
        }
        self.intakeId = intakeId
        deducted = try container.decodeIfPresent(Double.self, forKey: .deducted)
        undoToken = try container.decodeIfPresent(String.self, forKey: .undoToken)
    }
}

private struct MealFuelBody: Encodable {
    let servings: Double
    let confirmInsufficient: Bool
    let operationKey: String
    let idempotencyKey: String
    let occurredAt: String
    let fuelTimeZone: String?
    let notes: String?
    let energyKcal: Double?

    enum CodingKeys: String, CodingKey {
        case servings, confirmInsufficient, operationKey, idempotencyKey, occurredAt, fuelTimeZone
        case notes, energyKcal
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(servings, forKey: .servings)
        try container.encode(confirmInsufficient, forKey: .confirmInsufficient)
        try container.encode(operationKey, forKey: .operationKey)
        try container.encode(idempotencyKey, forKey: .idempotencyKey)
        try container.encode(occurredAt, forKey: .occurredAt)
        try container.encodeIfPresent(fuelTimeZone, forKey: .fuelTimeZone)
        try container.encodeIfPresent(notes, forKey: .notes)
        try container.encodeIfPresent(energyKcal, forKey: .energyKcal)
    }
}

enum MealFuelResult: Decodable, Sendable {
    case saved(intakeId: String, mealId: String, undoToken: String?)
    case needsConfirmation(missingIngredients: [MissingIngredientDetail])

    private enum CodingKeys: String, CodingKey {
        case intakeId, mealId, requiresConfirmation, missingIngredients, undoToken
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard container.contains(.requiresConfirmation) else {
            throw DecodingError.dataCorruptedError(
                forKey: .requiresConfirmation,
                in: container,
                debugDescription: "requiresConfirmation is required"
            )
        }
        if try container.decode(Bool.self, forKey: .requiresConfirmation) {
            self = .needsConfirmation(
                missingIngredients: try container.decode([MissingIngredientDetail].self, forKey: .missingIngredients)
            )
            return
        }
        let intakeId = try container.decode(String.self, forKey: .intakeId)
        let mealId = try container.decode(String.self, forKey: .mealId)
        guard !intakeId.isEmpty, !mealId.isEmpty else {
            throw DecodingError.dataCorruptedError(
                forKey: .intakeId,
                in: container,
                debugDescription: "saved Fuel log needs intakeId and mealId"
            )
        }
        let undoToken = try container.decodeIfPresent(String.self, forKey: .undoToken)
        self = .saved(intakeId: intakeId, mealId: mealId, undoToken: undoToken)
    }
}

/// One Add to Fuel sheet. Later submits, including a short-pantry retry, keep this key.
struct FuelAddAttempt: Equatable, Sendable {
    let operationKey: String
    let confirmInsufficient: Bool
}

struct FuelAddPresentation: Equatable, Sendable {
    private(set) var operationKey: String
    private(set) var confirmInsufficient: Bool

    init(operationKey: String = UUID().uuidString) {
        self.operationKey = operationKey
        self.confirmInsufficient = false
    }

    mutating func begin(operationKey: String = UUID().uuidString) {
        self.operationKey = operationKey
        self.confirmInsufficient = false
    }

    func submit() -> FuelAddAttempt {
        FuelAddAttempt(operationKey: operationKey, confirmInsufficient: confirmInsufficient)
    }

    mutating func confirmShortPantry() {
        confirmInsufficient = true
    }

    mutating func declineShortPantry() {
        confirmInsufficient = false
    }
}

struct FuelNeedsConfirmation: LocalizedError, Equatable {
    let message: String

    var errorDescription: String? { message }
}

enum FuelAddShortPantry {
    static func message(_ missing: [MissingIngredientDetail], mode: UnitDisplayMode) -> String {
        let lines = missing.map { ingredient in
            let required = QuantityPresenter.present(
                quantity: ingredient.required,
                unit: ingredient.unit,
                ingredientName: ingredient.name,
                mode: mode
            )
            let available = QuantityPresenter.present(
                quantity: ingredient.available,
                unit: ingredient.unit,
                ingredientName: ingredient.name,
                mode: mode
            )
            return "\(ingredient.name.capitalized): need \(required), have \(available)"
        }
        let noun = missing.count == 1 ? "ingredient" : "ingredients"
        return "Missing \(missing.count) \(noun).\n\(lines.joined(separator: "\n"))\n\nAdd to Fuel anyway and deduct what's available?"
    }
}
