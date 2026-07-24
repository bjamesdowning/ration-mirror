import Foundation

// MARK: - Manifest

struct MealPlanSummary: Codable, Sendable, Identifiable {
    let id: String
    let name: String
}

struct ManifestEntry: Codable, Sendable, Identifiable {
    let id: String
    let planId: String
    let mealId: String
    let date: String
    let slotType: String
    let orderIndex: Int
    let servingsOverride: Int?
    let notes: String?
    let consumedAt: Date?
    let createdAt: Date
    let mealName: String
    let mealServings: Int
    let mealType: String
    let mealPrepTime: Int?
    let mealCookTime: Int?

    var isConsumed: Bool { consumedAt != nil }
}

struct ManifestResponse: Codable, Sendable {
    let plan: MealPlanSummary
    let startDate: String
    let endDate: String
    let entries: [ManifestEntry]
    /// Dates excluded from Supply sync (`false` = off supply). Omitted dates default to included.
    let supplyDayInclusion: [String: Bool]?
}

struct ManifestEntryCreate: Encodable, Sendable {
    let mealId: String
    let date: String
    let slotType: String
    var servingsOverride: Int?
    var notes: String?
}

struct ManifestEntryCreateResponse: Codable, Sendable {
    let entry: ManifestEntry
}

struct ManifestConsumeRequest: Encodable, Sendable {
    let entryIds: [String]
    var confirmInsufficient: Bool?
}

struct MissingIngredientDetail: Codable, Sendable, Identifiable {
    var id: String { name }
    let name: String
    let required: Double
    let available: Double
    let unit: String
}

struct ManifestConsumeResponse: Codable, Sendable {
    let consumed: Int
    let undoToken: String?
    let requiresConfirmation: Bool?
    let missingIngredients: [MissingIngredientDetail]?
}

struct ManifestSupplyDayToggleResponse: Codable, Sendable {
    let date: String
    let includedInSupply: Bool
}

struct UndoActionRequest: Encodable, Sendable {
    let token: String
}

struct UndoActionResponse: Codable, Sendable {
    let success: Bool
    let kind: String?
}

// MARK: - Plan week / bulk

struct PlanWeekRequest: Encodable, Sendable {
    let startDate: String
    var days: Int = 7
    var slots: [String] = ["breakfast", "lunch", "dinner"]
    var tag: String?
    var dietaryNote: String?
    var variety: String = "medium"
}

struct PlanWeekScheduleEntry: Codable, Sendable, Identifiable {
    var id: String { "\(date)-\(slotType)-\(mealId)" }
    let date: String
    let slotType: String
    let mealId: String
    let mealName: String
    let notes: String?
}

struct PlanWeekStatusResponse: Codable, Sendable {
    let status: String
    let schedule: [PlanWeekScheduleEntry]?
    let error: String?
}

struct BulkManifestEntry: Encodable, Sendable {
    let mealId: String
    let date: String
    let slotType: String
    var servingsOverride: Int?
    var notes: String?
}

struct BulkManifestRequest: Encodable, Sendable {
    let entries: [BulkManifestEntry]
}

struct BulkManifestResponse: Codable, Sendable {
    let inserted: Int

    init(inserted: Int) {
        self.inserted = inserted
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        inserted = try container.decodeIfPresent(Int.self, forKey: .inserted)
            ?? container.decode(Int.self, forKey: .added)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(inserted, forKey: .inserted)
    }

    private enum CodingKeys: String, CodingKey {
        case inserted, added
    }
}

struct ManifestEntryDeleteResponse: Codable, Sendable {
    let deleted: Bool
}
