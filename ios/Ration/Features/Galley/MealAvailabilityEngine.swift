import Foundation

enum IngredientAvailabilityStatus: Equatable {
    case available
    case partial
    case missing
}

enum MealAvailabilityEngine {
    static func status(
        required: Double,
        available: Double
    ) -> IngredientAvailabilityStatus {
        if available >= required { return .available }
        if available > 0 { return .partial }
        return .missing
    }

    static func scaledQuantity(_ base: Double, baseServings: Int, desiredServings: Int) -> Double {
        guard baseServings > 0 else { return base }
        return base * Double(desiredServings) / Double(baseServings)
    }

    static func availabilityRows(
        meal: Meal,
        match: MealMatch?,
        desiredServings: Int
    ) -> [(ingredient: MealIngredient, status: IngredientAvailabilityStatus, subtitle: String?)] {
        let baseServings = max(meal.servings ?? 1, 1)
        return meal.ingredients.map { ingredient in
            let required = scaledQuantity(ingredient.quantity, baseServings: baseServings, desiredServings: desiredServings)
            let available = match?.availableIngredients?.first {
                $0.name.lowercased() == ingredient.ingredientName.lowercased()
            }
            let missing = match?.missingIngredients?.first {
                $0.name.lowercased() == ingredient.ingredientName.lowercased()
            }

            if let available {
                let stat = status(required: required, available: available.availableQuantity)
                let subtitle = stat == .available
                    ? nil
                    : "Have \(formatQty(available.availableQuantity)) of \(formatQty(required)) \(ingredient.unit)"
                return (ingredient, stat, subtitle)
            }
            if missing != nil {
                return (ingredient, .missing, "Need \(formatQty(required)) \(ingredient.unit)")
            }
            return (ingredient, .partial, nil)
        }
    }

    private static func formatQty(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...2)))
    }
}
