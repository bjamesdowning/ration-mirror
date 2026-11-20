import Foundation

/// Mirrors web `normalizeForCargoDedup` and `cargoMatchKey` from `app/lib/matching.ts`.
enum CargoNameNormalizer {
    private static let ingredientSynonyms: [String: String] = [
        "tinned": "canned",
        "courgette": "zucchini",
        "aubergine": "eggplant",
        "coriander": "cilantro",
        "rocket": "arugula",
        "prawns": "shrimp",
        "mince": "ground",
        "minced": "ground",
        "swede": "rutabaga",
        "mangetout": "snow peas",
        "single": "light",
        "double": "heavy",
        "wholemeal": "whole wheat",
        "capsicum": "bell pepper",
        "spring": "green",
        "bicarbonate": "baking",
        "bicarb": "baking",
    ]

    private static let stripWords: Set<String> = [
        "chopped", "diced", "sliced", "crushed", "minced", "peeled", "grated",
        "frozen", "fresh", "dried", "raw", "cooked", "roasted", "toasted",
        "tin", "can", "jar", "packet", "bag", "bunch", "sprig", "handful",
        "large", "small", "medium",
    ]

    private static let stemDeny: Set<String> = [
        "couscous", "asparagus", "molasses", "hummus", "glass", "bass",
    ]

    /// Same symbols as web `PANTRY_UNIT_TOKENS` (`SUPPORTED_UNITS` plus aliases).
    private static let unitTokens: Set<String> = [
        "kg", "g", "lb", "oz", "ml", "l", "tsp", "tbsp", "fl oz", "cup", "pt",
        "qt", "gal", "unit", "piece", "dozen", "bunch", "clove", "slice", "head",
        "stalk", "sprig", "can", "pack", "cups", "tablespoon", "tablespoons",
        "teaspoon", "teaspoons", "fluid ounce", "fluid ounces", "liter", "liters",
        "litre", "litres", "milliliter", "milliliters", "millilitre", "millilitres",
        "gram", "grams", "kilogram", "kilograms", "ounce", "ounces", "pound",
        "pounds", "lbs", "pint", "pints", "quart", "quarts", "gallon", "gallons",
        "pieces", "units", "dozens", "cans", "packs", "bunches", "cloves",
        "slices", "heads", "stalks", "sprigs", "bulb", "bulbs", "loaf", "loaves",
    ]

    static func normalizeForMatch(_ name: String) -> String {
        var result = name
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "/", with: " ")
            .replacingOccurrences(of: #"[^\w\s]"#, with: "", options: .regularExpression)
        result = result.replacingOccurrences(
            of: #"\s+"#,
            with: " ",
            options: .regularExpression
        )
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func normalizeForCargoDedup(_ name: String) -> String {
        pantryTokens(name).joined(separator: " ")
    }

    /// Culinary order. Token phase uses this. Stems only the last token.
    static func cargoMatchOrdered(_ name: String) -> String {
        var tokens = stripTrailingAmountAndUnit(pantryTokens(name))
        guard !tokens.isEmpty else { return "" }
        tokens[tokens.count - 1] = stemMatchToken(tokens[tokens.count - 1])
        return tokens.joined(separator: " ")
    }

    /// Exact key. Sorted tokens. Not the persisted snooze string.
    static func cargoMatchKey(_ name: String) -> String {
        let ordered = cargoMatchOrdered(name)
        guard !ordered.isEmpty else { return "" }
        return ordered.split(separator: " ").map(String.init).sorted().joined(separator: " ")
    }

    private static func pantryTokens(_ name: String) -> [String] {
        let base = normalizeForMatch(name)
        let tokens = base.split(separator: " ").flatMap { token -> [String] in
            let value = String(token)
            if let synonym = ingredientSynonyms[value] {
                return synonym.split(separator: " ").map(String.init)
            }
            return [value]
        }
        return tokens.filter { !$0.isEmpty && !stripWords.contains($0) }
    }

    private static func isAmount(_ token: String) -> Bool {
        token.range(of: #"^\d+(?:\.\d+)?$"#, options: .regularExpression) != nil
    }

    private static func isGluedAmountUnit(_ token: String) -> Bool {
        guard let match = token.range(of: #"^(\d+(?:\.\d+)?)([a-z]+)$"#, options: .regularExpression) else {
            return false
        }
        let suffix = String(token[match]).drop { $0.isNumber || $0 == "." }
        return unitTokens.contains(String(suffix))
    }

    private static func trailingUnitLength(_ tokens: [String]) -> Int {
        if tokens.count >= 2 {
            let pair = "\(tokens[tokens.count - 2]) \(tokens[tokens.count - 1])"
            if unitTokens.contains(pair) { return 2 }
        }
        if let last = tokens.last, unitTokens.contains(last) { return 1 }
        return 0
    }

    private static func stripTrailingAmountAndUnit(_ tokens: [String]) -> [String] {
        var out = tokens
        while !out.isEmpty {
            let last = out[out.count - 1]
            if isGluedAmountUnit(last) {
                out.removeLast()
                continue
            }
            let unitLen = trailingUnitLength(out)
            if unitLen > 0 && out.count > unitLen {
                out.removeLast(unitLen)
                continue
            }
            if isAmount(last) {
                out.removeLast()
                continue
            }
            break
        }
        return out.isEmpty ? tokens : out
    }

    private static func stemMatchToken(_ token: String) -> String {
        if stemDeny.contains(token) || token.hasSuffix("ss") { return token }
        if token.hasSuffix("oes"), token.count > 3 { return String(token.dropLast(2)) }
        if token.count > 3,
           token.hasSuffix("shes") || token.hasSuffix("ches") || token.hasSuffix("xes") || token.hasSuffix("zes") {
            return String(token.dropLast(2))
        }
        if token.hasSuffix("ies"), token.count > 3 {
            return String(token.dropLast(3)) + "y"
        }
        if token.hasSuffix("es"), token.count > 3 { return String(token.dropLast(1)) }
        if token.hasSuffix("s"), token.count > 2 { return String(token.dropLast(1)) }
        return token
    }
}
