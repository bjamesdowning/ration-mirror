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
    var consumedAt: Date?
    /// Shared preparation timestamp; server falls back to legacy `consumedAt` for old rows.
    /// Prefer this over `consumedAt` for "is this entry done?" checks.
    var cookedAt: Date? = nil
    let createdAt: Date
    let mealName: String
    let mealServings: Int
    let mealType: String
    let mealPrepTime: Int?
    let mealCookTime: Int?
    /// `meal.nutrition.perServing.energyKcal` when a nutrition snapshot exists (nutrition-manifest).
    var mealEnergyKcalPerServing: Double? = nil
    /// Current-user-only personal intake — never another member's (nutrition-cook-log-split).
    var personalIntake: ManifestPersonalIntake? = nil

    var isConsumed: Bool { consumedAt != nil }
    /// Effective prepared state — checks `cookedAt` first, then legacy `consumedAt`.
    var isCooked: Bool { cookedAt != nil || consumedAt != nil }
}

struct ManifestResponse: Codable, Sendable {
    let plan: MealPlanSummary
    let startDate: String
    let endDate: String
    let entries: [ManifestEntry]
    /// Dates excluded from Supply sync (`false` = off supply). Omitted dates default to included.
    let supplyDayInclusion: [String: Bool]?
    /// Only present when `nutrition-cook-log-split` + `nutrition-manifest` are both on.
    var intakeConsentGranted: Bool? = nil
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

// MARK: - Cook (shared, org-scoped — Cargo + preparation only, never personal nutrition)
// `POST /api/mobile/v1/manifest/cook` — gated by `nutrition-cook-log-split`.

struct CookEntriesRequest: Encodable, Sendable {
    let entryIds: [String]
    var confirmInsufficient: Bool?
}

struct CookEntriesResponse: Codable, Sendable {
    let cooked: Int
    let entryIds: [String]?
    let alreadyCookedIds: [String]?
    let partialCook: Bool?
    let skippedIngredients: [MissingIngredientDetail]?
    let undoToken: String?
    let requiresConfirmation: Bool?
    let missingIngredients: [MissingIngredientDetail]?
}

// MARK: - Eat (private personal intake — never mutates Cargo or shared plan state)
// `POST|DELETE /api/mobile/v1/manifest/entries/:entryId/intake` — gated by
// `nutrition-cook-log-split` + `nutrition-manifest` + intake consent; entry must be cooked first.

struct ManifestPersonalIntake: Codable, Sendable, Equatable {
    let id: String
    let servings: Double
    let energyKcal: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
    let occurredAt: Date
}

/// POST body — server stamps first-use intake consent when `consent == true`.
struct ManifestIntakeUpsertRequest: Encodable, Sendable {
    let servings: Double
    let idempotencyKey: String
    var consent: Bool?
}

struct ManifestIntakeUpsertResponse: Codable, Sendable {
    let intake: ManifestPersonalIntake
    let idempotent: Bool
    let replaced: Bool
    let intakeConsentGranted: Bool?
    let undoToken: String?
}

struct ManifestIntakeClearResponse: Codable, Sendable {
    let cleared: Bool
    let voidedIntakeId: String?
    let undoToken: String?
}
