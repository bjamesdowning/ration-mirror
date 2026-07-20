import Foundation

/// Canonical allergen definitions covering the EU Big 14.
/// Slugs match `app/lib/allergens.ts` — keep keyword maps in sync.
enum AllergenCatalog {
    struct Option: Identifiable, Hashable {
        let id: String
        let label: String
    }

    static let options: [Option] = [
        Option(id: "milk", label: "Milk / Dairy"),
        Option(id: "eggs", label: "Eggs"),
        Option(id: "fish", label: "Fish"),
        Option(id: "shellfish", label: "Shellfish"),
        Option(id: "tree-nuts", label: "Tree Nuts"),
        Option(id: "peanuts", label: "Peanuts"),
        Option(id: "wheat", label: "Wheat / Gluten"),
        Option(id: "soybeans", label: "Soybeans"),
        Option(id: "sesame", label: "Sesame"),
        Option(id: "mustard", label: "Mustard"),
        Option(id: "celery", label: "Celery"),
        Option(id: "lupin", label: "Lupin"),
        Option(id: "molluscs", label: "Molluscs"),
        Option(id: "sulphites", label: "Sulphites"),
    ]

    static let slugs: Set<String> = Set(options.map(\.id))

    private static let labelsBySlug: [String: String] = Dictionary(
        uniqueKeysWithValues: options.map { ($0.id, $0.label) }
    )

    /// Keyword synonyms per slug (slug itself is included via common variants).
    static let keywords: [String: [String]] = [
        "milk": [
            "milk", "dairy", "cream", "butter", "cheese",
            "yogurt", "yoghurt", "lactose", "whey", "casein",
        ],
        "eggs": ["egg", "eggs", "yolk", "albumin"],
        "fish": [
            "fish", "salmon", "tuna", "cod", "haddock", "tilapia",
            "sardine", "anchovy", "bass", "trout", "halibut", "mackerel",
        ],
        "shellfish": [
            "shrimp", "prawn", "crab", "lobster", "crayfish",
            "scallop", "clam", "oyster", "mussel", "shellfish",
        ],
        "tree-nuts": [
            "almond", "cashew", "walnut", "pecan", "pistachio",
            "hazelnut", "macadamia", "brazil nut", "pine nut", "tree nut",
        ],
        "peanuts": ["peanut", "groundnut", "peanut butter", "peanut oil"],
        "wheat": [
            "wheat", "flour", "gluten", "bread", "pasta", "semolina",
            "spelt", "kamut", "bulgur", "couscous", "farro", "durum",
        ],
        "soybeans": ["soy", "soya", "tofu", "tempeh", "miso", "edamame", "soybean"],
        "sesame": ["sesame", "tahini", "sesame oil", "sesame seed"],
        "mustard": ["mustard", "mustard seed", "mustard powder"],
        "celery": ["celery", "celeriac", "celery seed", "celery salt"],
        "lupin": ["lupin", "lupine", "lupin flour", "lupin seed"],
        "molluscs": ["squid", "octopus", "abalone", "snail", "mollusc", "mollusk"],
        "sulphites": [
            "sulphite", "sulfite", "sulphur dioxide", "sulfur dioxide",
            "so2", "wine", "dried fruit", "vinegar",
        ],
    ]

    static func label(for slug: String) -> String {
        labelsBySlug[slug] ?? slug
    }

    static func labels(for slugs: [String]) -> [String] {
        slugs.map { label(for: $0) }
    }

    static func isValidSlug(_ value: String) -> Bool {
        slugs.contains(value)
    }

    /// Keeps only known allergen slugs from a settings array.
    static func parse(_ raw: [String]?) -> [String] {
        guard let raw else { return [] }
        return raw.filter(isValidSlug)
    }
}

/// Client-side allergen detection — mirrors `detectAllergens` in `app/lib/allergens.ts`.
enum AllergenDetector {
    /// Returns the subset of `userAllergens` found in `ingredientNames` (case-insensitive substring).
    /// Empty when either input is empty.
    static func detect(
        ingredientNames: [String],
        userAllergens: [String]
    ) -> [String] {
        let allergens = AllergenCatalog.parse(userAllergens)
        guard !allergens.isEmpty, !ingredientNames.isEmpty else { return [] }

        let normalizedIngredients = ingredientNames.map { $0.lowercased() }

        return allergens.filter { slug in
            guard let keywords = AllergenCatalog.keywords[slug] else { return false }
            return normalizedIngredients.contains { ingredient in
                keywords.contains { keyword in
                    ingredient.contains(keyword)
                }
            }
        }
    }

    static func mealContainsAllergen(
        ingredientNames: [String],
        userAllergens: [String]
    ) -> Bool {
        !detect(ingredientNames: ingredientNames, userAllergens: userAllergens).isEmpty
    }
}
