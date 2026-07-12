import Foundation

/// Copy for the one-time Ask Ration welcome briefing (aligned with server constants).
enum OnboardingBriefingCopy {
    static let bootstrapPrompt =
        "I'm new to Ration on iOS. In plain language: what is it, how do Cargo, Galley, Manifest, and Supply work together, and what's the fastest way to get started?"

    static let staticReplayTitle = "Welcome to Ration"

    static let staticReplayMarkdown = """
    Ration is your **orbital supply chain** for the kitchen — a single system that connects what you stock, what you cook, what you plan, and what you need to buy.

    **Cargo** is your pantry. **Galley** holds recipes mapped to those ingredients. **Manifest** is your weekly meal plan. **Supply** turns that plan into a shopping list.

    **Fastest start on iOS:** open **Cargo** and add a few pantry items (manual entry works — no credits needed). Once Cargo reflects what you have, Galley and Manifest become much more useful.

    Tap **Enter Ration** when you're ready to explore the app.
    """

    static let composerLockedPlaceholder =
        "Welcome briefing complete. Unlock Ask with credits or Crew Member."

    static let enterRationTitle = "Enter Ration"
}
