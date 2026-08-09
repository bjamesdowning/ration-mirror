import Foundation

// MARK: - Nutrition Goals
// `GET/POST/PATCH/DELETE /api/mobile/v1/nutrition/goals` — gated by `nutrition-goals`.

struct NutritionGoal: Codable, Sendable, Identifiable, Equatable {
    let id: String
    let dailyEnergyKcal: Double?
    let proteinG: Double?
    let carbsG: Double?
    let fatG: Double?
    let fiberG: Double?
    let effectiveFrom: String
    let effectiveTo: String?
    let consentAt: Date?
    let createdAt: Date

    /// True when at least one nutrient target is set (mirrors server `countSetGoalNutrients`).
    var hasAnyTarget: Bool {
        dailyEnergyKcal != nil || proteinG != nil || carbsG != nil || fatG != nil || fiberG != nil
    }
}

struct NutritionGoalResponse: Codable, Sendable {
    let goal: NutritionGoal?
}

struct NutritionGoalClearResponse: Codable, Sendable {
    /// Server returns boolean; tolerate legacy numeric counts from older deploys.
    let cleared: Bool
    let goal: NutritionGoal?

    init(cleared: Bool, goal: NutritionGoal?) {
        self.cleared = cleared
        self.goal = goal
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // `decodeIfPresent(Bool)` throws on Int — tolerate both wire shapes.
        if let bool = try? c.decode(Bool.self, forKey: .cleared) {
            cleared = bool
        } else if let count = try? c.decode(Int.self, forKey: .cleared) {
            cleared = count > 0
        } else {
            cleared = false
        }
        goal = try c.decodeIfPresent(NutritionGoal.self, forKey: .goal)
    }

    private enum CodingKeys: String, CodingKey {
        case cleared, goal
    }
}

/// POST/PATCH body — server stamps `consentAt` when `consent == true` on first save.
struct NutritionGoalUpsertRequest: Encodable, Sendable {
    var dailyEnergyKcal: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
    var fiberG: Double?
    let effectiveFrom: String
    var consent: Bool?
}

// MARK: - Nutrition Summary
// `GET /api/mobile/v1/nutrition/summary?from=&to=` — gated by `nutrition-goals` OR `nutrition-manifest`.

struct NutritionDayTotals: Codable, Sendable, Identifiable, Equatable {
    var id: String { date }
    let date: String
    let energyKcal: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
    let coverageAvg: Double
    let entryCount: Int

    /// Zero-valued placeholder for days with no logged intake (sparse-fill charts).
    static func empty(date: String) -> NutritionDayTotals {
        NutritionDayTotals(
            date: date,
            energyKcal: 0,
            proteinG: 0,
            carbsG: 0,
            fatG: 0,
            coverageAvg: 0,
            entryCount: 0
        )
    }
}

struct NutritionSummary: Codable, Sendable, Equatable {
    struct Totals: Codable, Sendable, Equatable {
        let energyKcal: Double
        let proteinG: Double
        let carbsG: Double
        let fatG: Double
    }

    /// Active goal snapshot as of the summary range (nullable — Fiber lives here, not on day totals).
    struct Goal: Codable, Sendable, Equatable {
        let dailyEnergyKcal: Double?
        let proteinG: Double?
        let carbsG: Double?
        let fatG: Double?
        let fiberG: Double?
        let effectiveFrom: String
        let effectiveTo: String?

        /// True when at least one Manifest-relevant target is set (kcal / P / C / F; fiber is goal-only).
        var hasAnyManifestTarget: Bool {
            dailyEnergyKcal != nil || proteinG != nil || carbsG != nil || fatG != nil
        }
    }

    let from: String
    let to: String
    let totals: Totals
    let days: [NutritionDayTotals]
    let goal: Goal?
}

// MARK: - Cargo / Meal nutrition snapshots
// Additive JSON on cargo/meal detail — ignored by older clients; gated by `nutritionEngine` in UI.

struct NutrientValues: Codable, Sendable, Equatable, Hashable {
    var energyKcal: Double?
    var proteinG: Double?
    var fatG: Double?
    /// Wire key is `carbG` (singular) to match server snapshots.
    var carbG: Double?
    var fiberG: Double?
    var sugarG: Double?
    var satFatG: Double?
    var sodiumMg: Double?
    var saltG: Double?

    var hasAnyMacro: Bool {
        energyKcal != nil || proteinG != nil || fatG != nil || carbG != nil
    }

    init(
        energyKcal: Double? = nil,
        proteinG: Double? = nil,
        fatG: Double? = nil,
        carbG: Double? = nil,
        fiberG: Double? = nil,
        sugarG: Double? = nil,
        satFatG: Double? = nil,
        sodiumMg: Double? = nil,
        saltG: Double? = nil
    ) {
        self.energyKcal = energyKcal
        self.proteinG = proteinG
        self.fatG = fatG
        self.carbG = carbG
        self.fiberG = fiberG
        self.sugarG = sugarG
        self.satFatG = satFatG
        self.sodiumMg = sodiumMg
        self.saltG = saltG
    }

    /// Zeroed macros + null micros — matches server `emptyNutrients` / cargo override Zod.
    static func empty() -> NutrientValues {
        NutrientValues(
            energyKcal: 0,
            proteinG: 0,
            fatG: 0,
            carbG: 0,
            fiberG: nil,
            sugarG: nil,
            satFatG: nil,
            sodiumMg: nil,
            saltG: nil
        )
    }

    /// Cargo override Zod requires all macro numbers and explicit null micros.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        energyKcal = try c.decodeIfPresent(Double.self, forKey: .energyKcal)
        proteinG = try c.decodeIfPresent(Double.self, forKey: .proteinG)
        fatG = try c.decodeIfPresent(Double.self, forKey: .fatG)
        carbG = try c.decodeIfPresent(Double.self, forKey: .carbG)
        fiberG = try c.decodeIfPresent(Double.self, forKey: .fiberG)
        sugarG = try c.decodeIfPresent(Double.self, forKey: .sugarG)
        satFatG = try c.decodeIfPresent(Double.self, forKey: .satFatG)
        sodiumMg = try c.decodeIfPresent(Double.self, forKey: .sodiumMg)
        saltG = try c.decodeIfPresent(Double.self, forKey: .saltG)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(energyKcal ?? 0, forKey: .energyKcal)
        try c.encode(proteinG ?? 0, forKey: .proteinG)
        try c.encode(fatG ?? 0, forKey: .fatG)
        try c.encode(carbG ?? 0, forKey: .carbG)
        if let fiberG {
            try c.encode(fiberG, forKey: .fiberG)
        } else {
            try c.encodeNil(forKey: .fiberG)
        }
        if let sugarG {
            try c.encode(sugarG, forKey: .sugarG)
        } else {
            try c.encodeNil(forKey: .sugarG)
        }
        if let satFatG {
            try c.encode(satFatG, forKey: .satFatG)
        } else {
            try c.encodeNil(forKey: .satFatG)
        }
        if let sodiumMg {
            try c.encode(sodiumMg, forKey: .sodiumMg)
        } else {
            try c.encodeNil(forKey: .sodiumMg)
        }
        if let saltG {
            try c.encode(saltG, forKey: .saltG)
        } else {
            try c.encodeNil(forKey: .saltG)
        }
    }

    private enum CodingKeys: String, CodingKey {
        case energyKcal, proteinG, fatG, carbG, fiberG, sugarG, satFatG, sodiumMg, saltG
    }
}

/// Cargo item nutrition JSON (`cargo.nutrition`).
struct NutritionSnapshot: Codable, Sendable, Equatable, Hashable {
    var source: String?
    var confidence: Double?
    var verified: Bool?
    var per100g: NutrientValues?
    var perServing: NutrientValues?
    var fdcId: Int?
    var description: String?

    init(
        source: String? = nil,
        confidence: Double? = nil,
        verified: Bool? = nil,
        per100g: NutrientValues? = nil,
        perServing: NutrientValues? = nil,
        fdcId: Int? = nil,
        description: String? = nil
    ) {
        self.source = source
        self.confidence = confidence
        self.verified = verified
        self.per100g = per100g
        self.perServing = perServing
        self.fdcId = fdcId
        self.description = description
    }

    var displayNutrients: NutrientValues? {
        if let perServing, perServing.hasAnyMacro { return perServing }
        if let per100g, per100g.hasAnyMacro { return per100g }
        return perServing ?? per100g
    }

    var provenanceLabel: String {
        switch source {
        case "usda": return "USDA"
        case "ai_estimate": return "Estimated"
        case "user_override": return "Override"
        default: return displayNutrients == nil ? "Blank" : "Nutrition"
        }
    }

    /// Empty override shell used when the user starts typing macros from a blank state.
    static func blankUserOverride() -> NutritionSnapshot {
        NutritionSnapshot(
            source: "user_override",
            confidence: 1,
            verified: true,
            per100g: nil,
            perServing: .empty(),
            fdcId: nil,
            description: nil
        )
    }

    /// Apply editable macros; always marks provenance as user_override + verified (web parity).
    func applyingMacros(
        energyKcal: Double? = nil,
        proteinG: Double? = nil,
        fatG: Double? = nil,
        carbG: Double? = nil
    ) -> NutritionSnapshot {
        var base = perServing ?? per100g ?? .empty()
        if let energyKcal { base.energyKcal = energyKcal }
        if let proteinG { base.proteinG = proteinG }
        if let fatG { base.fatG = fatG }
        if let carbG { base.carbG = carbG }
        return NutritionSnapshot(
            source: "user_override",
            confidence: 1,
            verified: true,
            per100g: nil,
            perServing: base,
            fdcId: fdcId,
            description: description
        )
    }

    /// Encode nulls for cleared density fields so cargo override Zod accepts the payload.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        source = try c.decodeIfPresent(String.self, forKey: .source)
        confidence = try c.decodeIfPresent(Double.self, forKey: .confidence)
        verified = try c.decodeIfPresent(Bool.self, forKey: .verified)
        per100g = try c.decodeIfPresent(NutrientValues.self, forKey: .per100g)
        perServing = try c.decodeIfPresent(NutrientValues.self, forKey: .perServing)
        fdcId = try c.decodeIfPresent(Int.self, forKey: .fdcId)
        description = try c.decodeIfPresent(String.self, forKey: .description)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(source, forKey: .source)
        try c.encodeIfPresent(confidence, forKey: .confidence)
        try c.encodeIfPresent(verified, forKey: .verified)
        if let per100g {
            try c.encode(per100g, forKey: .per100g)
        } else {
            try c.encodeNil(forKey: .per100g)
        }
        if let perServing {
            try c.encode(perServing, forKey: .perServing)
        } else {
            try c.encodeNil(forKey: .perServing)
        }
        if let fdcId {
            try c.encode(fdcId, forKey: .fdcId)
        } else {
            try c.encodeNil(forKey: .fdcId)
        }
        if let description {
            try c.encode(description, forKey: .description)
        } else {
            try c.encodeNil(forKey: .description)
        }
    }

    private enum CodingKeys: String, CodingKey {
        case source, confidence, verified, per100g, perServing, fdcId, description
    }
}

/// Meal aggregate nutrition JSON (`meal.nutrition`).
struct MealNutritionSnapshot: Codable, Sendable, Equatable, Hashable {
    let perServing: NutrientValues?
    let coverage: Double?
    let computedAt: String?

    var displayNutrients: NutrientValues? { perServing }
}

// MARK: - Nutrition resolve (scan review)

struct NutritionResolveRequest: Encodable, Sendable {
    let names: [String]
    var ingestSource: String?
}

/// `POST /api/mobile/v1/nutrition/resolve` — map of name → snapshot (JSON null = no match).
struct NutritionResolveResponse: Decodable, Sendable {
    let snapshots: [String: NutritionSnapshot?]

    private struct DynamicKey: CodingKey {
        var stringValue: String
        init?(stringValue: String) { self.stringValue = stringValue }
        var intValue: Int? { nil }
        init?(intValue: Int) { nil }
    }

    private enum CodingKeys: String, CodingKey {
        case snapshots
    }

    init(from decoder: Decoder) throws {
        let root = try decoder.container(keyedBy: CodingKeys.self)
        let map = try root.nestedContainer(keyedBy: DynamicKey.self, forKey: .snapshots)
        var result: [String: NutritionSnapshot?] = [:]
        for key in map.allKeys {
            if try map.decodeNil(forKey: key) {
                result[key.stringValue] = .some(nil)
            } else {
                result[key.stringValue] = try map.decode(NutritionSnapshot.self, forKey: key)
            }
        }
        snapshots = result
    }

    /// Test / preview helper.
    init(snapshots: [String: NutritionSnapshot?]) {
        self.snapshots = snapshots
    }
}


