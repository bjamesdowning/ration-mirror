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
        desiredServings: Int,
        mode: UnitDisplayMode
    ) -> [(ingredient: MealIngredient, status: IngredientAvailabilityStatus, subtitle: String?)] {
        let baseServings = max(meal.servings ?? 1, 1)
        return meal.ingredients.map { ingredient in
            let required = scaledQuantity(ingredient.quantity, baseServings: baseServings, desiredServings: desiredServings)
            let requiredBase = ingredient.baseQuantity.map {
                scaledQuantity($0, baseServings: baseServings, desiredServings: desiredServings)
            }
            let requiredText = QuantityPresenter.presentStored(
                quantity: required,
                unit: ingredient.unit,
                baseQuantity: requiredBase,
                baseUnit: ingredient.baseUnit,
                ingredientName: ingredient.ingredientName,
                mode: mode
            )
            let available = match?.availableIngredients?.first {
                $0.name.lowercased() == ingredient.ingredientName.lowercased()
            }
            let missing = match?.missingIngredients?.first {
                $0.name.lowercased() == ingredient.ingredientName.lowercased()
            }

            if let available {
                let stat = status(required: required, available: available.availableQuantity)
                let haveText = QuantityPresenter.present(
                    quantity: available.availableQuantity,
                    unit: ingredient.unit,
                    ingredientName: ingredient.ingredientName,
                    mode: mode
                )
                let subtitle = stat == .available
                    ? nil
                    : "Have \(haveText) of \(requiredText)"
                return (ingredient, stat, subtitle)
            }
            if missing != nil {
                return (ingredient, .missing, "Need \(requiredText)")
            }
            return (ingredient, .partial, nil)
        }
    }
}
