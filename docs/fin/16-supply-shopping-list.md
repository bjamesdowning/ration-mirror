# Supply (shopping list)

**Supply** lists what you still need to buy for the **active group**, compared against **Cargo**.

## Purpose and sync sources

Sync merges demand from:

- **Galley** — meals marked active for Supply,
- **Manifest** — plan days marked **On Supply**, limited to the org **planning horizon** (`today` → `today + N − 1`; **1–30** days, default **7**),
- **Cargo** — restock toggles with an explicit buy quantity (default 1).

Meal ingredients subtract what is already in Cargo (including fuzzy name matches). The same ingredient from multiple sources appears as **one line** with origin badges (Manifest, Galley, Cargo) and quantities summed. Optional recipe ingredients are **not** added during list sync.

Quantities respect your global **unit display mode** (`original`, `metric`, `imperial`, or `cooking`) in **Settings → Preferences**. Liquids stay volume-based; volume-measured solids can use density-backed weight conversions and show an `≈` prefix when approximate.

## Actions

- **Sync / refresh** — Opening Supply **auto-syncs**. Use **Refresh list** to recompute manually.
- **Manual add / edit / remove** — Create, change, or delete list lines by hand.
- **Mark purchased** — Check off items while shopping; you can confirm quantity and unit when checking off. Checked items stay until you dock them or complete a receipt scan from Supply.
- **From meal** — Add missing ingredients for one specific meal onto the list.
- **Snooze** — Hide an ingredient from future syncs for a period (for example you already have it elsewhere). Snoozed items stay out until they expire or you clear them.
- **Dock / complete** — Move purchased lines into Cargo (same merge/dedup path as direct Cargo adds). Post-dock reconciliation updates pantry gaps and clears or reduces fulfilled restock toggles.
- **Replenish scan** — Scan or upload a receipt from Supply; Ration pairs receipt lines with the list so you can verify quantities before docking. Receipt scanning also works from **Cargo**. Scan cost: see *Receipt scanning* and *AI credits explained*.
- **Share** — Create a **public share link** so household members can toggle purchased state **without logging in**. Requires **Crew Member** eligibility — see *Free vs Crew Member*.
- **Export** — Export the list (for example text or markdown) for clipboard or notes.
- **Planning horizon** — Owners and admins set how many forward Manifest days feed Supply (Supply options or Group Settings). Members see the window read-only. Galley selections and Cargo restock are not date-filtered.

## Credits note

Supply **sync in the app** does **not** spend AI credits. MCP supply sync uses rate limits instead — see *MCP tools reference*.

If buttons differ in the app, use **Supply** hub guidance on screen.
