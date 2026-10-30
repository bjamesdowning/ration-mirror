# Ask Ration vs reading the guide

**Ask Ration** (in-app Copilot) and the self-serve **Help** guide at `/help` share the same **docs/fin** source of truth. Answers about how Ration works should match what you can read in Help.

## When to use each

- **Read the guide (`/help`)** — Prefer this when you want a stable walkthrough, to browse by topic, or to share a specific article. On the web, open **Settings → Help & Feedback** or go to `/help`. On iPhone, tap your profile picture to open **Account**, then tap **User guide** under **Help & Feedback**.
- **Ask Ration** — Prefer this when you need help **with your live kitchen**: inventory, meals, plan, supply, preferences, or a question that needs tools against your active group. Ask Ration can also search the same guide articles.

## Where Ask Ration lives on iPhone

An **Ask Ration** bar floats above the tab bar on every tab, with example prompts such as *Add butter to my cargo*, *Ask Ration what's for dinner*, *What's expiring this week?*, and *Show meals I can cook tonight*. Sending from the bar opens the full chat; the sparkles button opens it too. When you scroll down, the bar shrinks to a round chat button at the bottom-left, and the tab's action menu stays at the bottom-right. Tap the chat button to type again. Tap the down chevron, or swipe down, to hide the keyboard. The full chat has **Done** and **New Chat** at the top.

The first time you use Ask Ration or another AI feature, Ration asks **Allow AI features?** Tap **Allow** to continue, or **Not now** to skip. You can change this later in **Account → Feature enablement**.

## Credits

Ask Ration / Copilot token usage is billed in **AI credits**. See *AI credits explained* for the live matrix (roughly **1 credit per 20,000 tokens** per conversation, minimum 1, with a per-chat token cap).

## When answers disagree

For **subscription, credits, renewal, and account limits**, Ask Ration’s live billing tools (for example `get_billing_summary`) **win** over static guide text. For product how-to that is not live billing state, treat the app UI and Help articles as authoritative and update docs when they drift.

Ask Ration does **not** cancel subscriptions or change payment methods in chat — it points you to **Manage billing** (Stripe Customer Portal) or the App Store when applicable. See *Buying credits and Stripe*.
