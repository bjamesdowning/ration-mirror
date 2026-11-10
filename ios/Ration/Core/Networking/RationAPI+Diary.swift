import Foundation

struct DiaryMacrosBody: Encodable, Sendable {
    let energyKcal: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
}

struct DiaryFoodBody: Encodable, Sendable {
    let name: String
    let occurredAt: String
    let amount: Double
    let unit: String
    let macros: DiaryMacrosBody
    let idempotencyKey: String
    let operationKey: String
    var compositionSource: String? = nil

    enum CodingKeys: String, CodingKey {
        case name, occurredAt, amount, unit, macros, idempotencyKey, operationKey, compositionSource
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(occurredAt, forKey: .occurredAt)
        try container.encode(amount, forKey: .amount)
        try container.encode(unit, forKey: .unit)
        try container.encode(macros, forKey: .macros)
        try container.encode(idempotencyKey, forKey: .idempotencyKey)
        try container.encode(operationKey, forKey: .operationKey)
        try container.encodeIfPresent(compositionSource, forKey: .compositionSource)
    }
}

struct DiaryVoidBody: Encodable, Sendable {
    let confirm: Bool
    let operationKey: String
}

struct DiaryWriteResponse: Decodable, Sendable {
    let intakeId: String?
    let replayed: Bool?
    let credits: Int?
    let voided: Bool?
    let error: String?
    let code: String?

    enum CodingKeys: String, CodingKey {
        case intakeId, replayed, credits, voided, error, code
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        intakeId = try container.decodeIfPresent(String.self, forKey: .intakeId)
        replayed = try container.decodeIfPresent(Bool.self, forKey: .replayed)
        voided = try container.decodeIfPresent(Bool.self, forKey: .voided)
        error = try container.decodeIfPresent(String.self, forKey: .error)
        code = try container.decodeIfPresent(String.self, forKey: .code)
        if let whole = try? container.decodeIfPresent(Int.self, forKey: .credits) {
            credits = whole
        } else if let fractional = try? container.decodeIfPresent(Double.self, forKey: .credits),
                  fractional.isFinite {
            credits = Int(fractional.rounded())
        } else {
            credits = nil
        }
    }

    /// A write saved only when the body names an intake. An error envelope is not a save.
    var outcome: DiaryWriteOutcome {
        if let intakeId, !intakeId.isEmpty {
            return .saved(intakeId)
        }
        if let error, !error.isEmpty {
            return .rejected(error)
        }
        return .unreadable
    }
}

enum DiaryWriteOutcome: Equatable, Sendable {
    case saved(String)
    case rejected(String)
    case unreadable
}

struct DiaryExportResponse: Decodable, Sendable {
    struct Row: Decodable, Sendable {
        let name: String?
        let voidedAt: String?
        let loggedAmount: Double?
        let loggedUnit: String?
        let servings: Double
        let energyKcal: Double
        let proteinG: Double
        let carbsG: Double
        let fatG: Double
    }

    let intakes: [Row]
}

struct SavedFoodLogBody: Encodable, Sendable {
    let savedFoodId: String
    let occurredAt: String
    let idempotencyKey: String
    let operationKey: String
}

struct SaveFoodBody: Encodable, Sendable {
    let name: String
    let amount: Double
    let unit: String
    let macros: DiaryMacrosBody
}

struct SavedFoodRow: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let energyKcal: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
    let defaultAmount: Double?
    let defaultUnit: String?

    enum CodingKeys: String, CodingKey {
        case id, name, energyKcal, proteinG, carbsG, fatG, defaultAmount, defaultUnit
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        energyKcal = try Self.number(container, .energyKcal)
        proteinG = try Self.number(container, .proteinG)
        carbsG = try Self.number(container, .carbsG)
        fatG = try Self.number(container, .fatG)
        defaultAmount = Self.optionalNumber(container, .defaultAmount)
        defaultUnit = try container.decodeIfPresent(String.self, forKey: .defaultUnit)
    }

    private static func number(
        _ container: KeyedDecodingContainer<CodingKeys>,
        _ key: CodingKeys
    ) throws -> Double {
        if let value = try? container.decode(Double.self, forKey: key) { return value }
        if let raw = try? container.decode(String.self, forKey: key), let value = Double(raw) {
            return value
        }
        throw DecodingError.dataCorruptedError(
            forKey: key,
            in: container,
            debugDescription: "Expected a number"
        )
    }

    private static func optionalNumber(
        _ container: KeyedDecodingContainer<CodingKeys>,
        _ key: CodingKeys
    ) -> Double? {
        guard container.contains(key) else { return nil }
        if (try? container.decodeNil(forKey: key)) == true { return nil }
        if let value = try? container.decode(Double.self, forKey: key) { return value }
        if let raw = try? container.decode(String.self, forKey: key) { return Double(raw) }
        return nil
    }
}

struct SavedFoodListResponse: Decodable, Sendable {
    let savedFoods: [SavedFoodRow]
}

extension RationAPI {
    func logDiaryFood(_ body: DiaryFoodBody) async throws -> DiaryWriteResponse {
        try requireDiaryWrite(try await client.post("nutrition/diary", body: body))
    }

    func updateDiaryFood(id: String, body: DiaryFoodBody) async throws -> DiaryWriteResponse {
        try requireDiaryWrite(try await client.patch("nutrition/diary/\(id)", body: body))
    }

    func voidDiaryFood(id: String, body: DiaryVoidBody) async throws -> DiaryWriteResponse {
        try requireDiaryWrite(try await client.delete("nutrition/diary/\(id)", body: body))
    }

    func exportDiaryFood() async throws -> DiaryExportResponse {
        try await client.get("nutrition/diary/export")
    }

    func logSavedFood(_ body: SavedFoodLogBody) async throws -> DiaryWriteResponse {
        try requireDiaryWrite(try await client.post("nutrition/diary", body: body))
    }

    private func requireDiaryWrite(_ response: DiaryWriteResponse) throws -> DiaryWriteResponse {
        switch response.outcome {
        case .saved:
            return response
        case .rejected(let message):
            throw APIError.server(
                status: 200,
                message: message,
                code: response.code,
                errorCode: response.error
            )
        case .unreadable:
            throw APIError.decoding("diary write missing intakeId")
        }
    }

    func listSavedFoods() async throws -> SavedFoodListResponse {
        try await client.get("nutrition/saved-food")
    }

    func saveFood(_ body: SaveFoodBody) async throws -> SavedFoodRow {
        try await client.post("nutrition/saved-food", body: body)
    }

    func lookupFoodBarcode(_ barcode: String) async throws -> FoodBarcodeLookupResponse {
        try await client.post("nutrition/diary/barcode", body: FoodBarcodeBody(barcode: barcode))
    }

    func fuelDay(date: String) async throws -> FuelDayResponse {
        try await client.get("nutrition/fuel?date=\(date)")
    }

    func submitFuelPhoto(_ body: FuelPhotoSubmitBody) async throws -> FuelPhotoQueuedResponse {
        try await client.post("nutrition/diary/photo", body: body)
    }

    func fuelPhotoStatus(_ requestId: String) async throws -> FuelPhotoStatusResponse {
        try await client.get("nutrition/diary/photo/\(requestId)")
    }

    func confirmFuelPhoto(requestId: String, body: DiaryFoodBody) async throws -> DiaryWriteResponse {
        try requireDiaryWrite(
            try await client.post("nutrition/diary/photo/\(requestId)/confirm", body: body)
        )
    }

    func proposeFoodLog(
        photoRef: String,
        operationKey: String,
        subject: String,
        barcode: String?
    ) async throws -> FoodLogDraftResponse {
        try await client.post(
            "nutrition/diary/propose",
            body: ProposeFoodLogBody(
                operationKey: operationKey,
                photoRef: photoRef,
                subject: subject,
                barcode: barcode
            )
        )
    }

    func setHealthExport(
        enabled: Bool,
        confirm: Bool,
        deviceStatus: String
    ) async throws -> HealthExportStatusResponse {
        try await client.put(
            "nutrition/health-export",
            body: HealthExportPreferenceBody(
                enabled: enabled,
                confirm: confirm,
                deviceStatus: deviceStatus
            )
        )
    }

    func pendingHealthExport() async throws -> HealthExportPendingResponse {
        try await client.get("nutrition/health-export/pending")
    }
}

struct HealthExportPreferenceBody: Encodable, Sendable {
    let enabled: Bool
    let confirm: Bool
    let deviceStatus: String
}

struct HealthExportStatusResponse: Decodable, Sendable {
    let status: String?
    let enabled: Bool?
}

struct HealthExportPendingResponse: Decodable, Sendable {
    struct Sample: Decodable, Sendable {
        let syncIdentifier: String
        let syncVersion: Int
        let quantityType: String
        let value: Double
        let unit: String
        let healthSyncId: String
        let occurredAt: String
        let foodName: String
    }

    struct Delete: Decodable, Sendable {
        let healthSyncId: String
        let syncIdentifiers: [String]
    }

    let samples: [Sample]
    let deletes: [Delete]
}

struct FoodBarcodeBody: Encodable, Sendable {
    let barcode: String
}

struct FoodBarcodeLookupResponse: Decodable, Sendable {
    struct Macros: Decodable, Sendable {
        let energyKcal: Double
        let proteinG: Double
        let carbsG: Double
        let fatG: Double
    }

    let found: Bool?
    let name: String?
    let macros: Macros?
}

struct ProposeFoodLogBody: Encodable, Sendable {
    let operationKey: String
    let photoRef: String
    let subject: String
    let barcode: String?

    enum CodingKeys: String, CodingKey {
        case operationKey, photoRef, subject, barcode
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(operationKey, forKey: .operationKey)
        try container.encode(photoRef, forKey: .photoRef)
        try container.encode(subject, forKey: .subject)
        try container.encodeIfPresent(barcode, forKey: .barcode)
    }
}

struct FuelDayResponse: Decodable, Sendable {
    struct Goal: Decodable, Sendable {
        let dailyEnergyKcal: Double?
        let proteinG: Double?
        let carbsG: Double?
        let fatG: Double?
        let fiberG: Double?
    }

    struct Totals: Decodable, Sendable {
        let energyKcal: Double
        let proteinG: Double
        let carbsG: Double
        let fatG: Double
    }

    struct Item: Decodable, Identifiable, Sendable {
        let id: String
        let name: String
        let energyKcal: Double
        let proteinG: Double
        let carbsG: Double
        let fatG: Double
        let occurredAt: String
        let slotType: String?
    }

    let date: String
    let week: [String]
    let weekStart: String
    let loggedDates: [String]
    let used: Int
    let limit: Int?
    let crew: Bool
    let diaryLayout: String
    let fuelTimeZone: String?
    let goal: Goal?
    let totals: Totals?
    let items: [Item]
}

struct FuelPhotoSubmitBody: Encodable, Sendable {
    let operationKey: String
    let contentType: String
    let imageBase64: String
}

struct FuelPhotoQueuedResponse: Decodable, Sendable {
    let requestId: String
    let status: String
}

struct FuelPhotoStatusResponse: Decodable, Sendable {
    struct Line: Decodable, Sendable {
        let name: String?
        let energyKcal: Double?
        let proteinG: Double?
        let carbsG: Double?
        let fatG: Double?
    }

    let requestId: String
    let status: String
    let lines: [Line]?
}

struct FoodLogDraftResponse: Decodable, Sendable {
    struct Line: Decodable, Sendable {
        let name: String
        let energyKcal: Double
        let proteinG: Double
        let carbsG: Double
        let fatG: Double
    }

    let lines: [Line]
}
