# Subscription tiers: Free vs Crew Member

## Who sets the limits

Capacity and certain features for a group depend on the **organization owner’s** effective tier—not only on the person viewing the screen. A **free** user in a **Crew Member’s** household still benefits from that household’s Crew limits.

## Free tier (typical limits)

| Resource | Typical limit |
|----------|-----------------|
| Inventory items | 35 |
| Meals | 15 |
| Supply lists | 3 |
| Owned groups | 1 |
| Invite members | Not available |
| Share supply / manifest links | Not available |

## Crew Member (typical benefits)

| Benefit | Notes |
|---------|--------|
| Inventory, meals, supply lists | Effectively **unlimited** (fair use still applies) |
| Owned groups | Higher cap (for example multiple households) |
| Invitations | Can invite others to the org |
| Public share links | Supply list and meal plan sharing |
| Included credits | **Annual** plans may include a **welcome / renewal** credit bundle—see Pricing |

## Expiry

If a **Crew Member** subscription **expires**, the group may fall back to **free** limits until renewed. Cached tier data refreshes shortly after Stripe updates.

## Canceling Crew Member

Cancel through the **Stripe Customer Portal** via **Manage billing** from **Hub → Settings** or **Pricing** when shown. Ask Ration can explain your plan and point you to that portal (or the App Store management URL when applicable); it does not cancel in chat. Cancellation is typically **at end of billing period**, not instant removal. Until the period ends, the household keeps Crew limits.

## Roles

**Owner** and **admin** can perform some administrative actions (invitations, transfers—see Settings and *Groups and membership*). **Member** access is more limited.

## Upgrade prompts

When you hit a cap, the app should show an **upgrade** path with the resource name and current counts.

- **Web:** `UpgradePrompt` → Hub Pricing, plus soft `CapacityIndicator` meters near ~80% usage.
- **iOS:** Contextual `PaywallView` (RevenueCat) opens on `capacity_exceeded` / feature gates for cargo, meals, scan/supply dock, groups, and share. Soft `CapacityMeter` cues appear on Cargo and Galley list headers for Free tier. Paywall copy explains Crew benefits (unlimited capacity, groups & invites, share links) vs credit packs (AI features on both tiers).

Exact numbers and SKUs live on **Hub → Pricing**; if they differ from this table, **Pricing wins**.
