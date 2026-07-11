import Foundation

/// Onboarding copy aligned with web `app/components/onboarding/steps/`.
enum OnboardingCopy {
    static let totalSteps = 7
    static let lastStepIndex = 6

    static let welcomePromoCode = "WELCOME65"
    static let welcomePromoCredits = 65

    struct NomenclatureEntry: Identifiable {
        let id: String
        let term: String
        let definition: String
    }

    static let nomenclature: [NomenclatureEntry] = [
        NomenclatureEntry(id: "hub", term: "Hub", definition: "Your mission control — stats, widgets, and quick actions."),
        NomenclatureEntry(id: "cargo", term: "Cargo", definition: "Your pantry. Everything you stock, tracked in real time."),
        NomenclatureEntry(id: "galley", term: "Galley", definition: "Your recipe book. Meals mapped to Cargo ingredients."),
        NomenclatureEntry(id: "manifest", term: "Manifest", definition: "Your weekly meal plan. The source of truth for Supply."),
        NomenclatureEntry(id: "supply", term: "Supply", definition: "Your auto-generated shopping list based on your Manifest."),
    ]

    static let workflowChain = ["Cargo", "Galley", "Manifest", "Supply"]

    struct ContextualStep {
        let moduleLabel: String
        let systemImage: String
        let title: String
        let body: String
        let techInsights: [String]
    }

    static let contextualSteps: [ContextualStep] = [
        ContextualStep(
            moduleLabel: "Groups",
            systemImage: "person.3",
            title: "Groups — your household hub.",
            body: "Cargo, Galley, Manifest, Supply, and credits all live in a group. Your personal group starts solo. Crew Member lets you create more groups and invite family, roommates, or collaborators to share the same pantry, recipes, and meal plan.",
            techInsights: ["Manage groups and invite links in Settings → Group."]
        ),
        ContextualStep(
            moduleLabel: "Cargo",
            systemImage: "shippingbox",
            title: "Your pantry, always accurate.",
            body: "Track everything by type (Dry / Frozen), quantity, and expiry date. Add in bulk by scanning a receipt or snapping a photo of your fridge or pantry — the AI extracts items, quantities, and units.",
            techInsights: [
                "OCR + LLM extracts item names, quantities, and units from a receipt or fridge/pantry photo in seconds.",
                "Import CSV for bulk spreadsheet upload.",
            ]
        ),
        ContextualStep(
            moduleLabel: "Galley",
            systemImage: "fork.knife",
            title: "Your recipe book, ingredient-aware.",
            body: "Build meals and link each ingredient directly to Cargo. Generate new recipes with AI from your current Cargo. Ration shows you what you can cook right now based on what's in stock.",
            techInsights: [
                "Ingredients are matched to Cargo using semantic vectors — \"canned tomatoes\" resolves to \"tinned tomatoes\" automatically. Match Mode highlights meals you can cook right now.",
                "Recipes use cups and spoons; Ration converts to grams or oz for easier shopping.",
                "Import from URL or paste JSON.",
            ]
        ),
        ContextualStep(
            moduleLabel: "Manifest",
            systemImage: "calendar",
            title: "Plan the week. Feed the system.",
            body: "Schedule meals into daily slots. Use AI to plan the week, or schedule manually. The Manifest is the source of truth your Supply list reads from.",
            techInsights: [
                "Manifest data drives automated gap analysis — no manual list-building needed.",
                "See which meals are ready to cook at a glance.",
                "Share your meal plan with others via a read-only link (Crew Member).",
            ]
        ),
        ContextualStep(
            moduleLabel: "Supply",
            systemImage: "cart",
            title: "Your shopping list, auto-generated.",
            body: "Supply reads from your Manifest meal plan and any meals selected in Galley. Both are cross-referenced against your Cargo levels to generate exactly what you need to buy. Check items off while shopping, then dock them into Cargo.",
            techInsights: [
                "Hybrid search (boolean + semantic) ensures nothing is missed, even with partial or misspelled ingredient names.",
                "Supply converts recipe units (cups, tbsp) to store units (g, kg) using ingredient density.",
                "Generate a shareable link so others can view or mark items purchased (Crew Member).",
            ]
        ),
    ]

    struct TierInfo: Identifiable {
        let id: String
        let name: String
        let features: [String]
        let isHighlighted: Bool
    }

    /// Mirrors `app/lib/onboarding-tier-copy.ts` + `TIER_LIMITS`.
    static let tiers: [TierInfo] = [
        TierInfo(
            id: "free",
            name: "Free",
            features: [
                "35 cargo",
                "15 meals",
                "3 Supply lists",
                "+ AI Features (credits)",
            ],
            isHighlighted: false
        ),
        TierInfo(
            id: "crew_member",
            name: "Crew Member",
            features: [
                "Unlimited Cargo",
                "Unlimited Meals",
                "Unlimited lists",
                "65 credits for AI scans (Annual)",
            ],
            isHighlighted: true
        ),
    ]

    static func contextualStep(for step: Int) -> ContextualStep? {
        guard step >= 1, step <= 5 else { return nil }
        return contextualSteps[step - 1]
    }

    static func highlightedTab(for step: Int) -> Int? {
        switch step {
        case 2: return 1
        case 3: return 2
        case 4: return 3
        case 5: return 4
        default: return nil
        }
    }

    static func shouldOpenGroupSettings(for step: Int) -> Bool {
        step == 1
    }
}
