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
    var mealProteinGPerServing: Double? = nil
    var mealCarbsGPerServing: Double? = nil
    var mealFatGPerServing: Double? = nil
    /// Current-user-only personal intake — never another member's (nutrition-cook-log-split).
    var personalIntake: ManifestPersonalIntake? = nil

    var isConsumed: Bool { consumedAt != nil }
    /// Effective prepared state — checks `cookedAt` first, then legacy `consumedAt`.
    var isCooked: Bool { cookedAt != nil || consumedAt != nil }

    enum CodingKeys: String, CodingKey {
        case id, planId, mealId, date, slotType, orderIndex, servingsOverride, notes
        case consumedAt, cookedAt, createdAt, mealName, mealServings, mealType
        case mealPrepTime, mealCookTime
        case mealEnergyKcalPerServing, mealProteinGPerServing, mealCarbsGPerServing, mealFatGPerServing
        case personalIntake
    }

    init(
        id: String,
        planId: String,
        mealId: String,
        date: String,
        slotType: String,
        orderIndex: Int,
        servingsOverride: Int?,
        notes: String?,
        consumedAt: Date?,
        cookedAt: Date? = nil,
        createdAt: Date,
        mealName: String,
        mealServings: Int,
        mealType: String,
        mealPrepTime: Int?,
        mealCookTime: Int?,
        mealEnergyKcalPerServing: Double? = nil,
        mealProteinGPerServing: Double? = nil,
        mealCarbsGPerServing: Double? = nil,
        mealFatGPerServing: Double? = nil,
        personalIntake: ManifestPersonalIntake? = nil
    ) {
        self.id = id
        self.planId = planId
        self.mealId = mealId
        self.date = date
        self.slotType = slotType
        self.orderIndex = orderIndex
        self.servingsOverride = servingsOverride
        self.notes = notes
        self.consumedAt = consumedAt
        self.cookedAt = cookedAt
        self.createdAt = createdAt
        self.mealName = mealName
        self.mealServings = mealServings
        self.mealType = mealType
        self.mealPrepTime = mealPrepTime
        self.mealCookTime = mealCookTime
        self.mealEnergyKcalPerServing = mealEnergyKcalPerServing
        self.mealProteinGPerServing = mealProteinGPerServing
        self.mealCarbsGPerServing = mealCarbsGPerServing
        self.mealFatGPerServing = mealFatGPerServing
        self.personalIntake = personalIntake
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        planId = try c.decode(String.self, forKey: .planId)
        mealId = try c.decode(String.self, forKey: .mealId)
        date = try c.decode(String.self, forKey: .date)
        slotType = try c.decode(String.self, forKey: .slotType)
        orderIndex = try c.decodeTolerantTruncatingInt(forKey: .orderIndex)
        servingsOverride = try c.decodeTolerantOptionalTruncatingInt(forKey: .servingsOverride)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        consumedAt = try c.decodeTolerantOptionalDate(forKey: .consumedAt)
        cookedAt = try c.decodeTolerantOptionalDate(forKey: .cookedAt)
        createdAt = try c.decodeTolerantDate(forKey: .createdAt)
        mealName = try c.decode(String.self, forKey: .mealName)
        mealServings = try c.decodeTolerantTruncatingInt(forKey: .mealServings)
        mealType = try c.decode(String.self, forKey: .mealType)
        mealPrepTime = try c.decodeTolerantOptionalTruncatingInt(forKey: .mealPrepTime)
        mealCookTime = try c.decodeTolerantOptionalTruncatingInt(forKey: .mealCookTime)
        mealEnergyKcalPerServing = try c.decodeTolerantOptionalDouble(forKey: .mealEnergyKcalPerServing)
        mealProteinGPerServing = try c.decodeTolerantOptionalDouble(forKey: .mealProteinGPerServing)
        mealCarbsGPerServing = try c.decodeTolerantOptionalDouble(forKey: .mealCarbsGPerServing)
        mealFatGPerServing = try c.decodeTolerantOptionalDouble(forKey: .mealFatGPerServing)
        personalIntake = try c.decodeIfPresent(ManifestPersonalIntake.self, forKey: .personalIntake)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(planId, forKey: .planId)
        try c.encode(mealId, forKey: .mealId)
        try c.encode(date, forKey: .date)
        try c.encode(slotType, forKey: .slotType)
        try c.encode(orderIndex, forKey: .orderIndex)
        try c.encodeIfPresent(servingsOverride, forKey: .servingsOverride)
        try c.encodeIfPresent(notes, forKey: .notes)
        try c.encodeIfPresent(consumedAt, forKey: .consumedAt)
        try c.encodeIfPresent(cookedAt, forKey: .cookedAt)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(mealName, forKey: .mealName)
        try c.encode(mealServings, forKey: .mealServings)
        try c.encode(mealType, forKey: .mealType)
        try c.encodeIfPresent(mealPrepTime, forKey: .mealPrepTime)
        try c.encodeIfPresent(mealCookTime, forKey: .mealCookTime)
        try c.encodeIfPresent(mealEnergyKcalPerServing, forKey: .mealEnergyKcalPerServing)
        try c.encodeIfPresent(mealProteinGPerServing, forKey: .mealProteinGPerServing)
        try c.encodeIfPresent(mealCarbsGPerServing, forKey: .mealCarbsGPerServing)
        try c.encodeIfPresent(mealFatGPerServing, forKey: .mealFatGPerServing)
        try c.encodeIfPresent(personalIntake, forKey: .personalIntake)
    }
}

struct ManifestDayIntakeRow: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let manifestDate: String
    let slotType: String?
    let servings: Double
    let energyKcal: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
    let mealName: String?
    let organizationName: String?
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
    /// Personal diary rows for the loaded date range (cross-org when Flagship allows).
    var dayIntakeRows: [ManifestDayIntakeRow]? = nil
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

/// GET `/api/mobile/v1/manifest/planned-dates?from=&to=`
/// `consumedDates` only present when `nutrition-manifest` is enabled server-side.
struct ManifestPlannedDatesResponse: Codable, Sendable {
    let dates: [String]
    var consumedDates: [String]? = nil
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
    var notes: String? = nil

    enum CodingKeys: String, CodingKey {
        case id, servings, energyKcal, proteinG, carbsG, fatG, occurredAt, notes
    }

    init(
        id: String,
        servings: Double,
        energyKcal: Double,
        proteinG: Double,
        carbsG: Double,
        fatG: Double,
        occurredAt: Date,
        notes: String? = nil
    ) {
        self.id = id
        self.servings = servings
        self.energyKcal = energyKcal
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
        self.occurredAt = occurredAt
        self.notes = notes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        servings = try c.decodeTolerantDouble(forKey: .servings)
        energyKcal = try c.decodeTolerantDouble(forKey: .energyKcal)
        proteinG = try c.decodeTolerantDouble(forKey: .proteinG)
        carbsG = try c.decodeTolerantDouble(forKey: .carbsG)
        fatG = try c.decodeTolerantDouble(forKey: .fatG)
        occurredAt = try c.decodeTolerantDate(forKey: .occurredAt)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(servings, forKey: .servings)
        try c.encode(energyKcal, forKey: .energyKcal)
        try c.encode(proteinG, forKey: .proteinG)
        try c.encode(carbsG, forKey: .carbsG)
        try c.encode(fatG, forKey: .fatG)
        try c.encode(occurredAt, forKey: .occurredAt)
        try c.encodeIfPresent(notes, forKey: .notes)
    }
}

struct ManifestIntakeUpsertRequest: Encodable, Sendable {
    let servings: Double
    let idempotencyKey: String
    var notes: String? = nil
}

struct ManifestIntakeUpsertResponse: Codable, Sendable {
    let intake: ManifestPersonalIntake
    let idempotent: Bool
    let replayed: Bool?
    let replaced: Bool
    let intakeConsentGranted: Bool?
    let operationId: String?
    let dayTotals: [NutritionDayTotals]?
    let summaryGeneratedAt: String?
    let undoToken: String?
}

struct ManifestIntakeClearResponse: Codable, Sendable {
    let cleared: Bool
    let voidedIntakeId: String?
    let replayed: Bool?
    let operationId: String?
    let dayTotals: [NutritionDayTotals]?
    let summaryGeneratedAt: String?
    let undoToken: String?
}
