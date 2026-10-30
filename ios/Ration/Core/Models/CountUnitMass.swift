import Foundation

/// Links a counted pantry unit ("1 unit") to a real mass so USDA per-100 g
/// nutrients can scale. The saved fact is grams per one unit. Eating N units
/// uses N times that mass.
enum CountUnitMass {
    static let countUnits: Set<String> = [
        "unit", "piece", "dozen", "bunch", "clove", "slice", "head",
        "stalk", "sprig", "can", "pack",
    ]

    static let massUnits = ["g", "oz", "lb", "kg"]

    /// USDA density reference used when a count item has per-100 g data and no
    /// household portion yet. One unit starts at 100 g and can be changed.
    static let referenceGrams = 100.0

    static func isCount(_ unit: String) -> Bool {
        countUnits.contains(unit.lowercased())
    }

    /// Count stock with a per-100 g profile needs an explicit mass per unit.
    static func needsMassLink(nutrition: NutritionSnapshot?, unit: String) -> Bool {
        guard isCount(unit), let per100g = nutrition?.per100g, per100g.hasAnyMacro else {
            return false
        }
        return true
    }

    /// Grams already implied by household `perServing` versus `per100g`.
    /// Nil when the item only has the per-100 g reference.
    static func storedGramsPerUnit(nutrition: NutritionSnapshot?) -> Double? {
        guard let per100g = nutrition?.per100g, let perServing = nutrition?.perServing else {
            return nil
        }
        let pairs: [(Double?, Double?)] = [
            (per100g.energyKcal, perServing.energyKcal),
            (per100g.proteinG, perServing.proteinG),
            (per100g.carbG, perServing.carbG),
            (per100g.fatG, perServing.fatG),
        ]
        for (density, portion) in pairs {
            guard let density, let portion, density > 0, portion > 0 else { continue }
            let grams = (portion / density) * referenceGrams
            if grams.isFinite, grams > 0 { return grams }
        }
        return nil
    }

    /// Starting grams for one unit: the stored household mass, or 100 g.
    static func suggestedGramsPerUnit(nutrition: NutritionSnapshot?) -> Double? {
        guard nutrition?.per100g?.hasAnyMacro == true else { return nil }
        return storedGramsPerUnit(nutrition: nutrition) ?? referenceGrams
    }

    static func shouldPersist(nutrition: NutritionSnapshot?, gramsPerUnit: Double) -> Bool {
        guard gramsPerUnit > 0 else { return false }
        guard let stored = storedGramsPerUnit(nutrition: nutrition) else {
            return nutrition?.per100g?.hasAnyMacro == true
        }
        return abs(stored - gramsPerUnit) > 0.5
    }

    /// Household `perServing` for one unit, keeping the per-100 g density.
    /// Client cargo updates require `user_override`; the density numbers stay.
    static func snapshot(_ nutrition: NutritionSnapshot?, gramsPerUnit: Double) -> NutritionSnapshot? {
        guard gramsPerUnit > 0, let nutrition, let per100g = nutrition.per100g, per100g.hasAnyMacro else {
            return nil
        }
        return NutritionSnapshot(
            source: "user_override",
            confidence: 1,
            verified: true,
            per100g: per100g,
            perServing: per100g.scaled(by: gramsPerUnit / referenceGrams),
            fdcId: nutrition.fdcId,
            description: nutrition.description
        )
    }

    static func display(grams: Double, unit: String) -> Double {
        switch unit.lowercased() {
        case "kg": return grams / 1_000
        case "lb": return grams / (IntakeAmount.gramsPerOunce * 16)
        case "oz": return grams / IntakeAmount.gramsPerOunce
        default: return grams
        }
    }

    static func grams(from amount: Double, unit: String) -> Double {
        switch unit.lowercased() {
        case "kg": return amount * 1_000
        case "lb": return amount * IntakeAmount.gramsPerOunce * 16
        case "oz": return amount * IntakeAmount.gramsPerOunce
        default: return amount
        }
    }
}

private extension NutrientValues {
    func scaled(by factor: Double) -> NutrientValues {
        NutrientValues(
            energyKcal: energyKcal.map { $0 * factor },
            proteinG: proteinG.map { $0 * factor },
            fatG: fatG.map { $0 * factor },
            carbG: carbG.map { $0 * factor },
            fiberG: fiberG.map { $0 * factor },
            sugarG: sugarG.map { $0 * factor },
            satFatG: satFatG.map { $0 * factor },
            sodiumMg: sodiumMg.map { $0 * factor },
            saltG: saltG.map { $0 * factor }
        )
    }
}
