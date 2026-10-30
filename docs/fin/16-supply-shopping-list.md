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

- **Sync / refresh** — Opening Supply **auto-syncs** your **Live Supply**. Use **Refresh list** to recompute manually. Saved lists never sync on their own from Manifest, Galley, or Cargo.
- **Live Supply and saved lists (iPhone)** — The Supply tab is **Live Supply**, the trip you are shopping now. Only Live Supply can be checked off or docked into Cargo. On iPhone, tap the **Lists** icon at the top-left of Supply, or choose **Lists** in the bottom-right menu, to open **Lists**. It shows **Live Supply**, your **Saved lists** (staples, a party, a receipt), and **History** for archived lists. Adding a saved list's items to Live Supply never erases the saved list. Saved lists are not on the web app yet; the web Supply page shows Live Supply only. Free includes **3** lists (Live Supply included); Crew includes **25**. Archived lists count toward the cap.
- **Add to Supply** — On iPhone, open the bottom-right menu on Supply (**Supply actions**) and choose **Add to Supply**. The **Add to Live Supply** sheet takes one line or a comma-separated jot, such as `butter, eggs, bread`; `2 lb chicken` sets a quantity. Tap **Add N items**. Matching names gain quantity and become unchecked. On the web, use **Add to Supply** on the Supply page.
- **Saved lists (iPhone)** — In **Lists**, the bottom-right menu (**Lists actions**) offers **New saved list…** and **Save Live Supply as a list…**. Inside a saved list, the bottom-right menu (**List actions**) offers **Add to list**, **Add missing to Live**, **Duplicate this list** (or **Restore this list** in History), **Archive this list**, and **Delete this list**. Tap **+** on a row, or swipe it, to **Add to Live**. The bottom bar offers **Add N Missing to Live** (receipt lists: **Add All to Live**) and **Select**, which lets you pick rows and tap **Add N to Live**. Lines already on Live Supply, in the cart, or in Cargo are skipped. To add extra of a line that is already on Live Supply, tap it and choose **Add More**. Saved lists cannot be checked off or docked.
- **Pull from list (iPhone)** — On Supply, choose **Pull from list** in the bottom-right menu (or on an empty Supply). The **Pull from** sheet opens over Live Supply. Pick a **Saved list**, then tap items to add them, or tap **Add missing to Live**. When Live Supply is empty, **Add missing from <list name>** fills it in one tap. Tap **Close** when done.
- **Receipt into a list (iPhone)** — After a **Dock from Receipt** review, tap **Add to a list** and choose **Supply (Live)**, one of **Your lists**, or a new list (enter **List name**, then **Save as saved list**). This does not spend a second AI credit. To skip the list, tap **Dock N items to Cargo**.
- **Manual add / edit / remove** — Swipe a line to delete it. Check it off while shopping (Live Supply only).
- **Mark purchased** — Check off items while shopping; you can confirm quantity and unit when checking off. Checked items stay until you dock them or complete a receipt scan from Supply.
- **From meal** — Add missing ingredients for one specific meal onto the list.
- **Snooze** — Hide an ingredient from future syncs for a period (for example you already have it elsewhere). Snoozed items stay out until they expire or you clear them.
- **Dock** — Move purchased lines into Cargo (same merge/dedup path as direct Cargo adds). On iPhone, choose **Dock bought items to Cargo** in the bottom-right menu and confirm **Dock bought items**; checked items move into Cargo and unchecked items stay. On the web, use **Replenish Cargo** → **Dock from List**. Post-dock reconciliation updates pantry gaps and clears or reduces fulfilled restock toggles.
- **Replenish scan** — Scan or upload a receipt; Ration pairs receipt lines with Live Supply so you can verify quantities before docking. On iPhone, choose **Dock from Receipt** in the bottom-right menu. On the web, use **Replenish Cargo** → **Dock from Receipt**. Receipt scanning also works from **Cargo**. Scan cost: see *Receipt scanning* and *AI credits explained*.
- **Share** — Create a **public share link** from **Supply options**. Household members can check off Live Supply items **without logging in**. Requires **Crew Member** eligibility — see *Free vs Crew Member*.
- **Export** — Export the list (for example text or markdown) for clipboard or notes.
- **Planning horizon** — Owners and admins set how many forward Manifest days feed Supply (Supply options or Group Settings). Members see the window read-only. Galley selections and Cargo restock are not date-filtered.
- **Home Screen widget (iPhone)** — The **Supply** widget shows unchecked Live Supply items and checks them off without docking. See *Home Screen widgets (iPhone)*.

## Credits note

Supply **sync in the app** does **not** spend AI credits. MCP supply sync uses rate limits instead — see *MCP tools reference*.

If buttons differ in the app, use **Supply** hub guidance on screen.
