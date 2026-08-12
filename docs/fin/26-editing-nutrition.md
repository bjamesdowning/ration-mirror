# Editing nutrition

You can review and correct energy and macros before they are stored, and change them later on Cargo or Galley. Edits are saved as a **user override**.

## Before you add (scan review)

When the nutrition engine is on, Cargo photo scan and Supply dock **review** propose a nutrition snapshot per line before confirm: USDA first (high- and medium-confidence matches), then a labelled **AI Estimate** when USDA misses and `nutrition-ai-estimate` is on (`ingestSource: scan_review`). Open the nutrition panel on a line, adjust values if needed, then confirm add to Cargo — the preview snapshot is carried through. Saving your edits marks the snapshot as an **override** (verified).

Lookup runs **in the background after review opens** so you can correct names and quantities immediately. While it runs you will see **Looking up nutrients…** and a short calorie placeholder on each line; kcal fills in progressively (batched resolve) as matches return. If lookup fails, review stays usable — confirm can still resolve nutrition.

If a line stays blank (true miss / low confidence / AI off), you can still add the item and fill nutrition later in Cargo.

## Cargo later

On **Cargo → item detail → Edit**, the nutrition panel lets you set or clear per-serving energy and macros. Saving stores `user_override` with confidence treated as verified. Use this for manual adds, CSV imports that had no match, or correcting an AI estimate.

When package mass is known, Ration also stores a derived **per 100 g** density so meal scaling stays stable if you later change the cargo quantity.

Changing **quantity or unit** on Cargo (or in scan review) rescales package totals from that density — e.g. fixing `1 unit` → `1 L` of milk updates calories to the liter package. Scanned or USDA-style names (e.g. “organic whole milk”, “Milk, whole…”) still match density via longest phrase or leading token. If volume density is unknown, Ration temporarily assumes ~1 g/ml so liter/ml edits still rescale (compatibility behaviour; a later update will label that path as estimated). Manual overrides keep your package totals when correcting a unit without a prior mass, then re-derive density for the new size.

## Galley meals

Meal detail and edit show recipe-level nutrition when the engine is on (computed from ingredients or stored snapshots). Adjust before cooking or planning if the panel looks wrong; overrides follow the same verified-override pattern.

**Cargo overrides feed meal totals:** when a Galley ingredient matches a Cargo item (linked `cargoId` or exact normalized name) that has a `user_override` nutrition snapshot, meal recompute uses those macros instead of USDA. Saving or clearing a Cargo override refreshes affected meals in the org (bounded per request). USDA remains the default when no override match exists.

## Provenance after edit

| Before edit | After you save edits |
|-------------|----------------------|
| USDA / Estimated / Blank | **Override** — your values win; labelled verified |

Clearing nutrition (when the UI allows) removes the snapshot until the next resolve or manual entry.

## Tips

- Prefer editing on **scan review** so Cargo starts accurate.
- Treat **Estimated** rows as suggestions until you confirm or override.
- Goals and day totals only reflect what is stored on items/meals and what you log on Manifest Eat—see *Nutrition goals and tracking*.
- Editing Cargo/Galley nutrition changes the **kitchen** snapshot used for future cooks/logs; it does not rewrite past personal intake diary rows.

## Related

- *Nutrition overview* — Sources and labels.
- *Receipt scanning* — Review before save.
- *Cargo (pantry inventory)* — Detail and edit.
