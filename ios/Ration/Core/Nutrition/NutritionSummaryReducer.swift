import Foundation

/// Pure patches for nutrition summary day totals (Eat / clear responses).
enum NutritionSummaryReducer {
    /// Replaces overlapping days in `summary` with authoritative `dayTotals`, then recomputes range totals.
    /// Days outside `from...to` are ignored. Days in range without a replacement keep prior values.
    static func applyingDayTotals(
        _ summary: NutritionSummary,
        dayTotals: [NutritionDayTotals],
        from: String,
        to: String
    ) -> NutritionSummary {
        let replacements = Dictionary(
            dayTotals
                .filter { LocalDay.contains($0.date, from: from, to: to) }
                .map { ($0.date, $0) },
            uniquingKeysWith: { _, last in last }
        )
        guard !replacements.isEmpty else { return summary }

        var byDate = Dictionary(
            summary.days.map { ($0.date, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        for (date, totals) in replacements {
            byDate[date] = totals
        }

        let orderedDates = LocalDay.isoDates(from: summary.from, to: summary.to)
        let days: [NutritionDayTotals]
        if orderedDates.isEmpty {
            days = byDate.values.sorted { $0.date < $1.date }
        } else {
            days = orderedDates.map { date in
                byDate[date] ?? NutritionDayTotals.empty(date: date)
            }
        }

        return NutritionSummary(
            from: summary.from,
            to: summary.to,
            totals: recomputeTotals(days: days),
            days: days,
            goal: summary.goal
        )
    }

    static func recomputeTotals(days: [NutritionDayTotals]) -> NutritionSummary.Totals {
        var energy = 0.0
        var protein = 0.0
        var carbs = 0.0
        var fat = 0.0
        var fiberSum = 0.0
        var fiberKnown = false
        for day in days {
            energy += day.energyKcal
            protein += day.proteinG
            carbs += day.carbsG
            fat += day.fatG
            if let fiber = day.fiberG {
                fiberSum += fiber
                fiberKnown = true
            }
        }
        return NutritionSummary.Totals(
            energyKcal: energy,
            proteinG: protein,
            carbsG: carbs,
            fatG: fat,
            fiberG: fiberKnown ? fiberSum : nil
        )
    }
}
