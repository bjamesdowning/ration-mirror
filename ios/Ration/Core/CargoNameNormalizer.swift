import Foundation

/// Mirrors web `normalizeForCargoDedup` from `app/lib/matching.ts` for cargo link resolution.
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

    static func normalizeForMatch(_ name: String) -> String {
        var result = name
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"[^\w\s]"#, with: "", options: .regularExpression)
        result = result.replacingOccurrences(
            of: #"\s+"#,
            with: " ",
            options: .regularExpression
        )
        return result
    }

    static func normalizeForCargoDedup(_ name: String) -> String {
        let base = normalizeForMatch(name)
        let tokens = base.split(separator: " ").flatMap { token -> [String] in
            let value = String(token)
            if let synonym = ingredientSynonyms[value] {
                return synonym.split(separator: " ").map(String.init)
            }
            return [value]
        }
        return tokens
            .filter { !$0.isEmpty && !stripWords.contains($0) }
            .joined(separator: " ")
    }
}
