import Foundation

/// Same-family unit conversion — mirrors `app/lib/units.ts` core factors.
enum UnitConversion {
    private static let factors: [String: Double] = [
        "kg": 1000, "g": 1,
        "lb": 16, "oz": 1,
        "l": 1000, "ml": 1,
        "tsp": 4.92892, "tbsp": 14.7868, "fl oz": 29.5735,
        "cup": 236.588, "pt": 473.176, "qt": 946.353, "gal": 3785.41,
        "unit": 1, "piece": 1, "dozen": 12, "can": 1, "pack": 1,
    ]

    static func convert(_ quantity: Double, from: String, to: String) -> Double? {
        if from == to { return quantity }
        guard let fromFactor = factors[from], let toFactor = factors[to] else { return nil }
        let fromBase = baseUnit(for: from)
        let toBase = baseUnit(for: to)
        if fromBase != toBase {
            if (fromBase == "g" || fromBase == "oz") && (toBase == "g" || toBase == "oz") {
                let grams: Double
                if from == "g" { grams = quantity }
                else if from == "kg" { grams = quantity * 1000 }
                else if from == "oz" { grams = quantity / 0.035274 }
                else if from == "lb" { grams = quantity * 16 / 0.035274 }
                else { return nil }
                if to == "g" { return grams }
                if to == "kg" { return grams / 1000 }
                if to == "oz" { return grams * 0.035274 }
                if to == "lb" { return grams * 0.035274 / 16 }
                return nil
            }
            return nil
        }
        return quantity * fromFactor / toFactor
    }

    static func baseUnit(for unit: String) -> String {
        switch unit {
        case "kg", "g": return "g"
        case "lb", "oz": return "oz"
        case "ml", "l", "tsp", "tbsp", "fl oz", "cup", "pt", "qt", "gal": return "ml"
        case "can": return "can"
        case "pack": return "pack"
        default: return "unit"
        }
    }

    static func chooseReadableUnit(quantity: Double, baseUnit: String) -> (Double, String) {
        switch baseUnit {
        case "g":
            if quantity >= 1000 { return (quantity / 1000, "kg") }
            return (quantity, "g")
        case "oz":
            if quantity >= 16 { return (quantity / 16, "lb") }
            return (quantity, "oz")
        case "ml":
            if quantity >= 3785.41 { return (quantity / 3785.41, "gal") }
            if quantity >= 946.353 { return (quantity / 946.353, "qt") }
            if quantity >= 473.176 { return (quantity / 473.176, "pt") }
            if quantity >= 236.588 { return (quantity / 236.588, "cup") }
            if quantity >= 29.5735 { return (quantity / 29.5735, "fl oz") }
            if quantity >= 14.7868 { return (quantity / 14.7868, "tbsp") }
            if quantity >= 4.92892 { return (quantity / 4.92892, "tsp") }
            if quantity >= 1000 { return (quantity / 1000, "l") }
            return (quantity, "ml")
        default:
            return (quantity, baseUnit)
        }
    }
}

/// Mode transforms — mirrors shopping/cooking display paths in `units.ts`.
enum UnitDisplayTransform {
    static func toShoppingUnit(
        quantity: Double,
        unit: String,
        ingredientName: String,
        mode: UnitDisplayMode
    ) -> (Double, String) {
        if mode == .imperial {
            if ["g", "kg", "oz", "lb"].contains(unit) {
                if let oz = UnitConversion.convert(quantity, from: unit, to: "oz") {
                    return UnitConversion.chooseReadableUnit(quantity: oz, baseUnit: "oz")
                }
            }
            if let flOz = UnitConversion.convert(quantity, from: unit, to: "fl oz") {
                return (flOz, "fl oz")
            }
        }
        if ["g", "kg", "oz", "lb"].contains(unit) {
            if let g = UnitConversion.convert(quantity, from: unit, to: "g") {
                return UnitConversion.chooseReadableUnit(quantity: g, baseUnit: "g")
            }
        }
        if let ml = UnitConversion.convert(quantity, from: unit, to: "ml") {
            return UnitConversion.chooseReadableUnit(quantity: ml, baseUnit: "ml")
        }
        return (quantity, unit)
    }

    static func toCookingUnit(
        quantity: Double,
        unit: String,
        ingredientName: String
    ) -> (Double, String, Bool) {
        guard let density = IngredientDensity.lookup(ingredientName), density > 0 else {
            return (quantity, unit, false)
        }
        if RationUnits.group(for: unit) == .weight,
           let grams = UnitConversion.convert(quantity, from: unit, to: "g") {
            let ml = grams / density
            let cups = ml / 236.588
            return (cups, "cup", true)
        }
        if RationUnits.group(for: unit) == .volume,
           let ml = UnitConversion.convert(quantity, from: unit, to: "ml") {
            let cups = ml / 236.588
            return (cups, "cup", true)
        }
        return (quantity, unit, false)
    }
}

/// Orchestrator — mirrors `presentQuantity` from web.
enum QuantityPresenter {
    static func present(
        quantity: Double,
        unit: String,
        ingredientName: String,
        mode: UnitDisplayMode,
        approximate: Bool = false
    ) -> String {
        var qty = quantity
        var unitOut = unit
        var approx = approximate

        if mode == .cooking {
            let result = UnitDisplayTransform.toCookingUnit(
                quantity: qty,
                unit: unitOut,
                ingredientName: ingredientName
            )
            qty = result.0
            unitOut = result.1
            approx = approx || result.2
        } else if mode == .metric || mode == .imperial {
            let result = UnitDisplayTransform.toShoppingUnit(
                quantity: qty,
                unit: unitOut,
                ingredientName: ingredientName,
                mode: mode
            )
            qty = result.0
            unitOut = result.1
        }

        if mode != .original {
            let base = UnitConversion.baseUnit(for: unitOut)
            if base == "g" || base == "oz" || base == "ml" {
                let readable = UnitConversion.chooseReadableUnit(
                    quantity: UnitConversion.convert(qty, from: unitOut, to: base) ?? qty,
                    baseUnit: base
                )
                qty = readable.0
                unitOut = readable.1
            }
        }

        qty = QuantityPresentation.snapEpsilon(qty)
        return QuantityPresentation.formatQuantity(qty, unit: unitOut, approximate: approx)
    }
}
