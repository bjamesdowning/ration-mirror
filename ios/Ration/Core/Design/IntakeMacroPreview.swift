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

/// Scale cargo nutrition for a Quick Eat amount (client preview only).
enum CargoEatMacroEstimate {
    static func scaled(
        nutrition: NutritionSnapshot?,
        quantity: Double,
        unit: String
    ) -> (energyKcal: Double?, proteinG: Double?, carbsG: Double?, fatG: Double?) {
        guard quantity > 0, let nutrition else {
            return (nil, nil, nil, nil)
        }
        let unitLower = unit.lowercased()
        let isMassOrVolume =
            ["g", "kg", "mg", "ml", "l", "oz", "lb", "cup", "tbsp", "tsp"].contains(unitLower)

        if isMassOrVolume, let per100g = nutrition.per100g, per100g.hasAnyMacro {
            let grams: Double?
            switch unitLower {
            case "g", "ml":
                grams = quantity
            case "kg", "l":
                grams = quantity * 1000
            case "mg":
                grams = quantity / 1000
            default:
                // Volume without density — fall through to perServing.
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
            return (
                perServing.energyKcal.map { $0 * quantity },
                perServing.proteinG.map { $0 * quantity },
                perServing.carbG.map { $0 * quantity },
                perServing.fatG.map { $0 * quantity }
            )
        }

        if let per100g = nutrition.per100g, per100g.hasAnyMacro {
            // Count / unknown mass: treat display density as one portion unit.
            return (
                per100g.energyKcal.map { $0 * quantity },
                per100g.proteinG.map { $0 * quantity },
                per100g.carbG.map { $0 * quantity },
                per100g.fatG.map { $0 * quantity }
            )
        }

        return (nil, nil, nil, nil)
    }
}
