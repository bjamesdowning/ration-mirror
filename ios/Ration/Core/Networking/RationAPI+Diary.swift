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
}

struct SavedFoodListResponse: Decodable, Sendable {
    let savedFoods: [SavedFoodRow]
}

extension RationAPI {
    func logDiaryFood(_ body: DiaryFoodBody) async throws -> DiaryWriteResponse {
        try await client.post("nutrition/diary", body: body)
    }

    func updateDiaryFood(id: String, body: DiaryFoodBody) async throws -> DiaryWriteResponse {
        try await client.patch("nutrition/diary/\(id)", body: body)
    }

    func voidDiaryFood(id: String, body: DiaryVoidBody) async throws -> DiaryWriteResponse {
        try await client.delete("nutrition/diary/\(id)", body: body)
    }

    func exportDiaryFood() async throws -> DiaryExportResponse {
        try await client.get("nutrition/diary/export")
    }

    func logSavedFood(_ body: SavedFoodLogBody) async throws -> DiaryWriteResponse {
        try await client.post("nutrition/diary", body: body)
    }

    func listSavedFoods() async throws -> SavedFoodListResponse {
        try await client.get("nutrition/saved-food")
    }

    func saveFood(_ body: SaveFoodBody) async throws -> SavedFoodRow {
        try await client.post("nutrition/saved-food", body: body)
    }
}
