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

    /// Compact Manifest day-strip lines for nutrients that have a positive target.
    /// Fiber appears only when day.fiberG is known (honest — no false 0).
    struct ManifestStripLine: Equatable {
        let key: String
        let label: String
        let actual: Double
        let target: Double
        let unit: String

        var ratio: Double { actual / target }

        var isOverTarget: Bool { ratio > 1 }

        var displayText: String {
            "\(Int(actual.rounded())) / \(Int(target.rounded())) \(unit)"
        }

        var spokenUnit: String {
            switch unit {
            case "g": return "grams"
            case "kcal": return "calories"
            default: return unit
            }
        }

        var accessibilityName: String {
            switch key {
            case "energy": return "Calories"
            case "protein": return "Protein"
            case "carbs": return "Carbs"
            case "fat": return "Fat"
            case "fiber": return "Fiber"
            default: return label
            }
        }

        var accessibilityText: String {
            let percent = Int((ratio * 100).rounded())
            var text =
                "\(accessibilityName), \(Int(actual.rounded())) of \(Int(target.rounded())) \(spokenUnit), \(percent) percent"
            if isOverTarget {
                text += ", over target"
            }
            return text
        }
    }

    static func manifestStripLines(
        day: NutritionDayTotals,
        goal: NutritionSummary.Goal?
    ) -> [ManifestStripLine] {
        guard let goal else { return [] }
        var lines: [ManifestStripLine] = []
        if let target = goal.dailyEnergyKcal, target > 0 {
            lines.append(ManifestStripLine(
                key: "energy",
                label: "Calories",
                actual: day.energyKcal,
                target: target,
                unit: "kcal"
            ))
        }
        if let target = goal.proteinG, target > 0 {
            lines.append(ManifestStripLine(
                key: "protein",
                label: "P",
                actual: day.proteinG,
                target: target,
                unit: "g"
            ))
        }
        if let target = goal.carbsG, target > 0 {
            lines.append(ManifestStripLine(
                key: "carbs",
                label: "C",
                actual: day.carbsG,
                target: target,
                unit: "g"
            ))
        }
        if let target = goal.fatG, target > 0 {
            lines.append(ManifestStripLine(
                key: "fat",
                label: "F",
                actual: day.fatG,
                target: target,
                unit: "g"
            ))
        }
        if let target = goal.fiberG, target > 0, let fiberActual = day.fiberG {
            lines.append(ManifestStripLine(
                key: "fiber",
                label: "Fiber",
                actual: fiberActual,
                target: target,
                unit: "g"
            ))
        }
        return lines
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
