import SwiftUI

/// Shared kcal / P / C / F preview for Eat / plate-up sheets.
struct IntakeMacroPreview: View {
    var energyKcal: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
    var unavailableMessage: String = "Nutrition unavailable."

    private var hasAny: Bool {
        energyKcal != nil || proteinG != nil || carbsG != nil || fatG != nil
    }

    var body: some View {
        if hasAny {
            Group {
                if let energyKcal {
                    LabeledContent(
                        "Calories",
                        value: "\(Int(energyKcal.rounded())) kcal"
                    )
                }
                if let proteinG {
                    LabeledContent("Protein", value: formatGrams(proteinG))
                }
                if let carbsG {
                    LabeledContent("Carbs", value: formatGrams(carbsG))
                }
                if let fatG {
                    LabeledContent("Fat", value: formatGrams(fatG))
                }
            }
        } else {
            Text(unavailableMessage)
                .rationCaption()
                .foregroundStyle(Theme.muted)
        }
    }

    private func formatGrams(_ value: Double) -> String {
        if value.truncatingRemainder(dividingBy: 1) == 0 {
            return "\(Int(value)) g"
        }
        return String(format: "%.1f g", value)
    }
}

/// Scale cargo nutrition for a Quick Eat amount (client preview).
/// Matches web `scaleCargoEatMacros`: mass/volume from density; count from
/// household/package `perServing` — never treat `per100g` as per count unit.
enum CargoEatMacroEstimate {
    static func scaled(
        nutrition: NutritionSnapshot?,
        quantity: Double,
        unit: String,
        packageQuantity: Double? = nil
    ) -> (energyKcal: Double?, proteinG: Double?, carbsG: Double?, fatG: Double?) {
        guard quantity > 0, let nutrition else {
            return (nil, nil, nil, nil)
        }
        let unitLower = unit.lowercased()
        let discreteCount = [
            "unit", "piece", "dozen", "bunch", "clove", "slice", "head",
            "stalk", "sprig", "can", "pack",
        ].contains(unitLower)

        if let per100g = nutrition.per100g, per100g.hasAnyMacro {
            let grams: Double?
            switch unitLower {
            case "g", "ml":
                grams = quantity
            case "kg", "l":
                grams = quantity * 1000
            default:
                grams = nil
            }
            if let grams, grams > 0 {
                let factor = grams / 100
                return (
                    per100g.energyKcal.map { $0 * factor },
                    per100g.proteinG.map { $0 * factor },
                    per100g.carbG.map { $0 * factor },
                    per100g.fatG.map { $0 * factor }
                )
            }
        }

        if let perServing = nutrition.perServing, perServing.hasAnyMacro {
            let factor: Double
            if discreteCount,
               nutrition.per100g == nil,
               nutrition.source == "user_override" || nutrition.source == "ai_estimate",
               let packageQuantity, packageQuantity > 0 {
                factor = quantity / packageQuantity
            } else {
                factor = quantity
            }
            return (
                perServing.energyKcal.map { $0 * factor },
                perServing.proteinG.map { $0 * factor },
                perServing.carbG.map { $0 * factor },
                perServing.fatG.map { $0 * factor }
            )
        }

        // Density-only count/can/pack: no authentic per-unit mass.
        return (nil, nil, nil, nil)
    }
}
