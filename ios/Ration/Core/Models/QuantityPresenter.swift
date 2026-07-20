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

    /// Same-family readable scaling (imperial volume ladder for ml).
    static func chooseReadableUnit(quantity: Double, baseUnit: String) -> (Double, String) {
        switch baseUnit {
        case "g":
            if quantity >= 1000 { return (quantity / 1000, "kg") }
            return (quantity, "g")
        case "oz":
            if quantity >= 16 { return (quantity / 16, "lb") }
            return (quantity, "oz")
        case "ml":
            return chooseReadableImperialVolume(quantity)
        default:
            return (quantity, baseUnit)
        }
    }

    static func chooseReadableMetricVolume(_ quantityMl: Double) -> (Double, String) {
        if quantityMl >= 1000 { return (quantityMl / 1000, "l") }
        return (quantityMl, "ml")
    }

    static func chooseReadableImperialVolume(_ quantityMl: Double) -> (Double, String) {
        if quantityMl >= 3785.41 { return (quantityMl / 3785.41, "gal") }
        if quantityMl >= 946.353 { return (quantityMl / 946.353, "qt") }
        if quantityMl >= 473.176 { return (quantityMl / 473.176, "pt") }
        if quantityMl >= 236.588 { return (quantityMl / 236.588, "cup") }
        if quantityMl >= 29.5735 { return (quantityMl / 29.5735, "fl oz") }
        if quantityMl >= 14.7868 { return (quantityMl / 14.7868, "tbsp") }
        if quantityMl >= 4.92892 { return (quantityMl / 4.92892, "tsp") }
        return (quantityMl, "ml")
    }

    /// Mode-aware readable scaling — mirrors `chooseReadableUnitForMode` in units.ts.
    static func chooseReadableUnitForMode(
        quantity: Double,
        baseUnit: String,
        mode: UnitDisplayMode
    ) -> (Double, String) {
        switch baseUnit {
        case "g":
            if mode == .imperial,
               let oz = convert(quantity, from: "g", to: "oz") {
                return chooseReadableUnit(quantity: oz, baseUnit: "oz")
            }
            return chooseReadableUnit(quantity: quantity, baseUnit: "g")
        case "oz":
            if mode == .metric,
               let grams = convert(quantity, from: "oz", to: "g") {
                return chooseReadableUnit(quantity: grams, baseUnit: "g")
            }
            return chooseReadableUnit(quantity: quantity, baseUnit: "oz")
        case "ml":
            if mode == .metric {
                return chooseReadableMetricVolume(quantity)
            }
            return chooseReadableImperialVolume(quantity)
        default:
            return (quantity, baseUnit)
        }
    }
}

/// Mode transforms — mirrors shopping/cooking display paths in `units.ts`.
enum UnitDisplayTransform {
    private static let liquidHints: Set<String> = [
        "milk", "water", "oil", "juice", "broth", "stock", "vinegar",
        "wine", "beer", "cream", "sauce", "syrup", "honey", "soy",
    ]

    static func isLikelyLiquid(_ name: String) -> Bool {
        let tokens = name.lowercased()
            .split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            .map(String.init)
        if let density = IngredientDensity.lookup(name), density >= 0.9, density <= 1.15 {
            return true
        }
        return tokens.contains { liquidHints.contains($0) }
    }

    static func toShoppingUnit(
        quantity: Double,
        unit: String,
        ingredientName: String,
        mode: UnitDisplayMode
    ) -> (Double, String) {
        let weightUnits = ["g", "kg", "oz", "lb"]

        if mode == .imperial {
            if weightUnits.contains(unit),
               let oz = UnitConversion.convert(quantity, from: unit, to: "oz") {
                return UnitConversion.chooseReadableUnit(quantity: oz, baseUnit: "oz")
            }
        }

        if mode == .metric {
            if weightUnits.contains(unit),
               let g = UnitConversion.convert(quantity, from: unit, to: "g") {
                return UnitConversion.chooseReadableUnit(quantity: g, baseUnit: "g")
            }
        }

        guard RationUnits.group(for: unit) == .volume,
              let volumeInMl = UnitConversion.convert(quantity, from: unit, to: "ml") else {
            return (quantity, unit)
        }

        if isLikelyLiquid(ingredientName) {
            if mode == .metric {
                return UnitConversion.chooseReadableMetricVolume(volumeInMl)
            }
            return UnitConversion.chooseReadableImperialVolume(volumeInMl)
        }

        // Volume solids with density → weight for shopping display
        if let density = IngredientDensity.lookup(ingredientName), density > 0,
           let grams = IngredientDensity.convertWithDensity(
               quantity: quantity,
               from: unit,
               to: "g",
               density: density
           ) {
            if mode == .imperial,
               let oz = UnitConversion.convert(grams, from: "g", to: "oz") {
                return UnitConversion.chooseReadableUnit(quantity: oz, baseUnit: "oz")
            }
            return UnitConversion.chooseReadableUnit(quantity: grams, baseUnit: "g")
        }

        if mode == .metric {
            return UnitConversion.chooseReadableMetricVolume(volumeInMl)
        }
        return UnitConversion.chooseReadableImperialVolume(volumeInMl)
    }

    static func toCookingUnit(
        quantity: Double,
        unit: String,
        ingredientName: String
    ) -> (Double, String, Bool) {
        guard let density = IngredientDensity.lookup(ingredientName), density > 0 else {
            return (quantity, unit, false)
        }
        if isLikelyLiquid(ingredientName) {
            return (quantity, unit, false)
        }
        if RationUnits.group(for: unit) == .weight,
           let grams = UnitConversion.convert(quantity, from: unit, to: "g") {
            let ml = grams / density
            let readable = UnitConversion.chooseReadableImperialVolume(ml)
            return (readable.0, readable.1, true)
        }
        if RationUnits.group(for: unit) == .volume {
            return (quantity, unit, false)
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
                let inBase = UnitConversion.convert(qty, from: unitOut, to: base) ?? qty
                let readable = UnitConversion.chooseReadableUnitForMode(
                    quantity: inBase,
                    baseUnit: base,
                    mode: mode
                )
                qty = readable.0
                unitOut = readable.1
            }
        }

        qty = QuantityPresentation.snapEpsilon(qty)
        return QuantityPresentation.formatQuantity(qty, unit: unitOut, approximate: approx)
    }

    /// Unit-only presentation result for tests (mirrors web `presentQuantity` fields).
    static func presentResult(
        quantity: Double,
        unit: String,
        ingredientName: String,
        mode: UnitDisplayMode
    ) -> (quantity: Double, unit: String) {
        var qty = quantity
        var unitOut = unit

        if mode == .cooking {
            let result = UnitDisplayTransform.toCookingUnit(
                quantity: qty,
                unit: unitOut,
                ingredientName: ingredientName
            )
            qty = result.0
            unitOut = result.1
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
                let inBase = UnitConversion.convert(qty, from: unitOut, to: base) ?? qty
                let readable = UnitConversion.chooseReadableUnitForMode(
                    quantity: inBase,
                    baseUnit: base,
                    mode: mode
                )
                qty = readable.0
                unitOut = readable.1
            }
        }

        return (QuantityPresentation.snapEpsilon(qty), unitOut)
    }
}
