import Foundation

/// Quick-add scaling for Add Fuel. Ounces and pounds use 28.3495 g, then per 100 g.
enum AddFuelScaling {
    static let gramsPerOunce = 28.3495

    struct Macros: Equatable {
        var energyKcal: Double
        var proteinG: Double
        var carbsG: Double
        var fatG: Double
    }

    static func grams(quantity: Double, unit: String) -> Double? {
        guard quantity > 0 else { return nil }
        switch unit {
        case "g", "ml":
            return quantity
        case "kg", "l":
            return quantity * 1000
        case "oz":
            return quantity * gramsPerOunce
        case "lb":
            return quantity * 16 * gramsPerOunce
        default:
            return nil
        }
    }

    /// `carbG` on the density block is returned as `carbsG`.
    static func fromPer100g(
        energyKcal: Double,
        proteinG: Double,
        carbG: Double,
        fatG: Double,
        quantity: Double,
        unit: String
    ) -> Macros? {
        guard let grams = grams(quantity: quantity, unit: unit), grams > 0 else { return nil }
        let factor = grams / 100
        return Macros(
            energyKcal: energyKcal * factor,
            proteinG: proteinG * factor,
            carbsG: carbG * factor,
            fatG: fatG * factor
        )
    }

    static func meal(perServing: Macros, servings: Double) -> Macros? {
        guard servings > 0 else { return nil }
        return Macros(
            energyKcal: perServing.energyKcal * servings,
            proteinG: perServing.proteinG * servings,
            carbsG: perServing.carbsG * servings,
            fatG: perServing.fatG * servings
        )
    }
}
