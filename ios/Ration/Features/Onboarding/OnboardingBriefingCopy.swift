import Foundation

/// Copy for the Ask-first iOS onboarding briefing (aligned with server constants).
enum OnboardingBriefingCopy {
    static let bootstrapPrompt = "What is Ration?"

    /// Must match `ONBOARDING_BRIEFING_SEED_PROMPT` in `app/lib/copilot/constants.ts` exactly (SHA-256 allowlist).
    static let seedPrompt = """
Please add these common kitchen staples to my cargo with sensible quantities and units:

- 500g butter
- 12 eggs
- 2 litres milk
- 1kg flour
- 500ml olive oil

For a few items, also set expiry and tags to show how that works — you don't need tags or expiry on everything:

- Milk: expires in about 2 weeks, tag as dairy
- Eggs: expires in about 3 weeks, tag as dairy
- Butter: expires in about 4 weeks, tag as dairy
- Flour: tag as staple

Use today's date from context to calculate expiry dates. Add each item with add_cargo_item. When done, tell me how many items you added and which ones have expiry dates or tags.
"""

    static let seedCardTitle = "Stock my kitchen"
    static let seedCardSubtitle =
        "Tap to send this prompt — watch Copilot add staples with expiry & tags"
    static let seedCardDisabledSubtitle = "Requires Copilot briefing"
    static let seedSuggestedLabel = "Suggested"
    static let seedSuccessToast = "5 items added to Cargo"
    static let seeInCargoTitle = "See in Cargo"
    static let getStartedTitle = "Get Started"
    static let enterRationTitle = "Get Started"
    static let connectingTitle = "Linking to Ration Copilot…"
    static let emptyStateTitle = "Welcome briefing"
    static let emptyStateMessage =
        "Ration Copilot will explain how the app works, then you can stock a starter kitchen."
    static let retryIntroTitle = "Retry intro"
    static let retrySeedTitle = "Retry seed"
    static let seedSendFailedMessage = "Couldn't start the kitchen seed. Tap retry or Get Started."

    static let staticReplayTitle = "Welcome to Ration"

    static let staticReplayMarkdown = """
    Ration is your **orbital supply chain** for the kitchen — a single system that connects what you stock, what you cook, what you plan, and what you need to buy.

    **Cargo** is your pantry. **Galley** holds recipes mapped to those ingredients. **Manifest** is your weekly meal plan. **Supply** turns that plan into a shopping list.

    **Fastest start:** open **Cargo** and add a few pantry items. Once Cargo reflects what you have, Galley and Manifest become much more useful.

    Tap **Get Started** when you're ready to explore the app — or **See in Cargo** below to jump straight to your pantry.
    """

    static let composerLockedPlaceholder =
        "Welcome briefing complete. Unlock Ask with credits or Crew Member."

    static let fallbackNextStepsTitle = "Next steps"
}
