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
}
