import Foundation

/// Copy for the Ask-first iOS onboarding briefing (aligned with server constants).
enum OnboardingBriefingCopy {
    static let bootstrapPrompt = "What is Ration?"

    /// Must match `ONBOARDING_BRIEFING_SEED_PROMPT` in `app/lib/copilot/constants.ts` exactly (SHA-256 allowlist).
    static let seedPrompt = """
Please add 2 litres of milk to my cargo.

Set expiry to about 2 weeks from today, and tag it as dairy.

Use today's date from context to calculate the expiry date. Add the item with add_cargo_item. When done, briefly confirm what you added, including the expiry date and tag.
"""

    static let seedCardTitle = "Stock my kitchen"
    static let seedCardSubtitle =
        "Tap to send — watch Copilot add milk with expiry & a dairy tag"
    static let seedCardDisabledSubtitle = "Requires Copilot briefing"
    static let seedSuggestedLabel = "Suggested"
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
    static let emptyIntroMessage =
        "Copilot didn't return a welcome reply. Tap retry to try again, or Get Started to continue."
    static let introRetryFailedMessage =
        "Couldn't restart the welcome intro. Tap Get Started to continue."

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
