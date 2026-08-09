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
    let cleared: Bool
    let goal: NutritionGoal?
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
    }

    let from: String
    let to: String
    let totals: Totals
    let days: [NutritionDayTotals]
    let goal: Goal?
}
