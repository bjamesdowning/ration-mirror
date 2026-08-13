import Foundation

/// Mirrors web `isTokenPhaseMatch` / compound guards from `app/lib/matching.ts`.
enum CargoTokenMatcher {
    private static let stopWords: Set<String> = ["the", "a", "an", "of", "and", "or", "for"]
    private static let ultraGenericHeads: Set<String> = [
        "sauce", "spice", "seasoning", "mix", "paste", "extract", "juice",
    ]
    private static let transformingHeads: Set<String> = [
        "vinegar", "sauce", "paste", "juice", "extract", "oil", "water",
        "broth", "stock", "wine", "beer", "soup", "seasoning", "spice", "mix",
        "powder", "syrup", "relish", "chutney", "dressing", "butter", "milk", "cream",
    ]
    private static let fragileHeads: Set<String> = [
        "butter", "milk", "cream", "yogurt", "yoghurt",
    ]
    private static let fragileBlockingModifiers: Set<String> = [
        "peanut", "almond", "cashew", "coconut", "soy", "soya", "oat", "rice",
        "cocoa", "cacao", "sunflower", "seed", "nut", "hazelnut", "walnut",
        "pistachio", "macadamia", "goat", "sheep", "buffalo", "condensed",
        "evaporated", "powdered",
    ]
    private static let pepperVegetableModifiers: Set<String> = [
        "bell", "chili", "chilli", "chile", "sweet", "hot", "cayenne",
    ]

    static func isTokenPhaseMatch(recipeName: String, cargoName: String) -> Bool {
        let recipeNorm = CargoNameNormalizer.normalizeForCargoDedup(recipeName)
        let cargoNorm = CargoNameNormalizer.normalizeForCargoDedup(cargoName)
        guard !recipeNorm.isEmpty, !cargoNorm.isEmpty, recipeNorm != cargoNorm else {
            return false
        }
        if ultraGenericHeads.contains(headNoun(recipeNorm)) { return false }

        let headPath = isBidirectionalHeadNounSubset(recipeNorm, cargoNorm)
        let leadPath = isLeadingTokenSpecialization(recipeNorm: recipeNorm, cargoNorm: cargoNorm)
        guard headPath || leadPath else { return false }
        return passesCompoundGuard(recipeNorm: recipeNorm, cargoNorm: cargoNorm)
    }

    static func headNoun(_ normalizedName: String) -> String {
        contentTokens(normalizedName).last ?? ""
    }

    static func leadingToken(_ normalizedName: String) -> String {
        contentTokens(normalizedName).first ?? ""
    }

    private static func contentTokens(_ normalizedName: String) -> [String] {
        normalizedName
            .split(whereSeparator: \.isWhitespace)
            .map(String.init)
            .filter { $0.count > 1 && !stopWords.contains($0) }
    }

    private static func tokensOfNormalized(_ normalizedName: String) -> Set<String> {
        Set(contentTokens(normalizedName))
    }

    private static func isSubset(_ smaller: Set<String>, _ larger: Set<String>) -> Bool {
        guard !smaller.isEmpty else { return false }
        return smaller.isSubset(of: larger)
    }

    private static func isBidirectionalHeadNounSubset(_ a: String, _ b: String) -> Bool {
        let normA = CargoNameNormalizer.normalizeForCargoDedup(a)
        let normB = CargoNameNormalizer.normalizeForCargoDedup(b)
        guard !normA.isEmpty, !normB.isEmpty else { return false }
        let headA = headNoun(normA)
        let headB = headNoun(normB)
        guard !headA.isEmpty, headA == headB else { return false }
        let tokensA = tokensOfNormalized(normA)
        let tokensB = tokensOfNormalized(normB)
        return isSubset(tokensA, tokensB) || isSubset(tokensB, tokensA)
    }

    private static func isLeadingTokenSpecialization(recipeNorm: String, cargoNorm: String) -> Bool {
        let recipeTokens = tokensOfNormalized(recipeNorm)
        let cargoTokens = tokensOfNormalized(cargoNorm)
        guard recipeTokens.count == 1, cargoTokens.count >= 2 else { return false }
        guard let sole = recipeTokens.first else { return false }
        guard leadingToken(cargoNorm) == sole else { return false }
        guard isSubset(recipeTokens, cargoTokens) else { return false }
        if transformingHeads.contains(headNoun(cargoNorm)) { return false }
        return true
    }

    private static func passesCompoundGuard(recipeNorm: String, cargoNorm: String) -> Bool {
        let recipeTokens = tokensOfNormalized(recipeNorm)
        let cargoTokens = tokensOfNormalized(cargoNorm)
        guard !recipeTokens.isEmpty, !cargoTokens.isEmpty else { return false }
        if ultraGenericHeads.contains(headNoun(recipeNorm)) { return false }

        let (shorter, longer) = recipeTokens.count <= cargoTokens.count
            ? (recipeTokens, cargoTokens)
            : (cargoTokens, recipeTokens)
        if shorter.count > 2 { return true }

        let extra = longer.subtracting(shorter)
        if shorter.count == 1, shorter.contains("pepper") {
            if extra.contains(where: { pepperVegetableModifiers.contains($0) }) {
                return false
            }
        }
        if shorter.count == 1, let sole = shorter.first, fragileHeads.contains(sole) {
            if extra.contains(where: { fragileBlockingModifiers.contains($0) }) {
                return false
            }
        }
        return true
    }
}
