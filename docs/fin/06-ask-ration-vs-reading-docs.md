# Ask Ration vs reading the guide

**Ask Ration** (in-app Copilot) and the self-serve **Help** guide at `/help` share the same **docs/fin** source of truth. Answers about how Ration works should match what you can read in Help.

## When to use each

- **Read the guide (`/help`)** — Prefer this when you want a stable walkthrough, to browse by topic, or to share a specific article. Open **Settings → Help & Feedback**, or go to `/help` directly.
- **Ask Ration** — Prefer this when you need help **with your live kitchen**: inventory, meals, plan, supply, preferences, or a question that needs tools against your active group. Ask Ration can also search the same guide articles.

## Credits

Ask Ration / Copilot token usage is billed in **AI credits**. See *AI credits explained* for the live matrix (roughly **1 credit per 20,000 tokens** per conversation, minimum 1, with a per-chat token cap).

## When answers disagree

For **subscription, credits, renewal, and account limits**, Ask Ration’s live billing tools (for example `get_billing_summary`) **win** over static guide text. For product how-to that is not live billing state, treat the app UI and Help articles as authoritative and update docs when they drift.

Ask Ration does **not** cancel subscriptions or change payment methods in chat — it points you to **Manage billing** (Stripe Customer Portal) or the App Store when applicable. See *Buying credits and Stripe*.
