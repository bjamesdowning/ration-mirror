import Foundation

/// Pure nutrient-vs-goal ratio math for the Nutrition Goals summary UI.
/// No I/O — operates on already-decoded `NutritionSummary` values.
enum NutritionGoalProgress {
    struct Ratios: Equatable {
        var energy: Double?
        var protein: Double?
        var carbs: Double?
        var fat: Double?
        var fiber: Double?
    }

    /// `actual / target`, or `nil` when the target is unset/non-positive (nothing to divide by).
    static func ratio(actual: Double, target: Double?) -> Double? {
        guard let target, target > 0 else { return nil }
        return actual / target
    }

    /// Fiber has no daily "actual" (Manifest strips don't track fiber intake by design —
    /// see `fiberG` on `NutritionSummary.Goal`, goal-only). Callers pass a fiber actual only
    /// when they have one (e.g. a future intake source); otherwise it stays `nil`.
    static func ratios(
        totals: NutritionSummary.Totals,
        goal: NutritionSummary.Goal?,
        fiberActualG: Double? = nil
    ) -> Ratios {
        Ratios(
            energy: ratio(actual: totals.energyKcal, target: goal?.dailyEnergyKcal),
            protein: ratio(actual: totals.proteinG, target: goal?.proteinG),
            carbs: ratio(actual: totals.carbsG, target: goal?.carbsG),
            fat: ratio(actual: totals.fatG, target: goal?.fatG),
            fiber: fiberActualG.flatMap { ratio(actual: $0, target: goal?.fiberG) }
        )
    }

    /// Clamped `0...1` for progress-bar fill width. Over-target ratios stay uncapped
    /// in `ratios(totals:goal:)` for callers that want to show ">100%" text.
    static func clamped(_ ratio: Double?) -> Double {
        guard let ratio, ratio.isFinite else { return 0 }
        return min(max(ratio, 0), 1)
    }
}

/// Fills gaps in server-returned sparse day totals so charts render a contiguous X-axis.
enum NutritionDayFill {
    /// The server omits days with zero logged entries. This backfills every ISO date in
    /// `from...to` (inclusive) with a zero-valued `NutritionDayTotals` where missing,
    /// preserving the server's ordering/values for days that do have data.
    static func fillSparseDays(
        from: String,
        to: String,
        days: [NutritionDayTotals]
    ) -> [NutritionDayTotals] {
        let allDates = ManifestDateHelpers.isoDates(from: from, to: to)
        guard !allDates.isEmpty else { return days }
        let byDate = Dictionary(days.map { ($0.date, $0) }, uniquingKeysWith: { first, _ in first })
        return allDates.map { date in
            byDate[date] ?? NutritionDayTotals.empty(date: date)
        }
    }
}
