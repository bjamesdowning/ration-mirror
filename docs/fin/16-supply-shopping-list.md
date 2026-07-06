# Supply (shopping list)

## Purpose

**Supply** lists what you still need to buy to cook your **selected** Galley meals and your **Manifest** week, compared against **Cargo**. Quantities respect your global **unit display mode** (`original`, `metric`, `imperial`, or `cooking`) — set it in **System → Preferences** or toggle from the hub toolbar. Display uses `presentQuantity()` from canonical `base_quantity` / `base_unit` stored at sync time (authored `quantity` / `unit` remain for Original mode and editing). Liquids stay volume-based; volume-measured solids can use density-backed weight conversions and show an `≈` prefix when approximate.

## Updating the list

Use **Update list** (or equivalent) on the Supply page to **recompute** from current selections and the plan. This matches ingredient names to pantry items—including **fuzzy** matches—so “cilantro” and “fresh coriander” might resolve correctly.

## Snooze

**Snooze** hides an ingredient from future syncs for a period (e.g. you already have soy sauce in another container). Snoozed items stay out until they expire or you clear them.

## Purchased state

**Mark purchased** (check off) while you shop — you can confirm quantity and unit when checking off an item. Checked items stay on the list until you **dock** them to Cargo or complete a **receipt scan** from Supply.

**Replenish Cargo** offers two paths:

- **From purchased list** — moves checked-off lines into Cargo using listed quantities.
- **From receipt** — scan or upload a receipt; Ration pairs receipt lines with your Supply list so you can verify quantities before docking.

Receipt scanning also works directly from **Cargo** when you are not using a shopping list.

Optional recipe ingredients are **not** added to Supply during list sync.

## Sharing the list

A **public share link** lets household members toggle purchased state **without logging in**. Creating shares requires **Crew Member** eligibility—see *Subscription tiers*.

## Credits

Supply **sync in the app** does **not** use the same meter as MCP; MCP has its own rate limits—see *MCP tools reference* for `sync_supply_from_selected_meals`.

If buttons differ in the app, use **Supply** hub guidance on screen.
