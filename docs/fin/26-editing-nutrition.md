# Editing nutrition

You can review and correct energy and macros before they are stored, and change them later on Cargo or Galley. Edits are saved as a **user override**.

## Before you add (scan review)

When the nutrition engine is on, receipt (and similar) **scan review** proposes a nutrition snapshot per line after USDA resolve (and optional AI estimate on miss). Open the nutrition panel on a line, adjust values if needed, then confirm add to Cargo. Saving your edits marks the snapshot as an **override** (verified).

If a line stays blank, you can still add the item and fill nutrition later in Cargo.

## Cargo later

On **Cargo → item detail → Edit**, the nutrition panel lets you set or clear per-serving energy and macros. Saving stores `user_override` with confidence treated as verified. Use this for manual adds, CSV imports that had no match, or correcting an AI estimate.

## Galley meals

Meal detail and edit show recipe-level nutrition when the engine is on (computed from ingredients or stored snapshots). Adjust before cooking or planning if the panel looks wrong; overrides follow the same verified-override pattern.

## Provenance after edit

| Before edit | After you save edits |
|-------------|----------------------|
| USDA / Estimated / Blank | **Override** — your values win; labelled verified |

Clearing nutrition (when the UI allows) removes the snapshot until the next resolve or manual entry.

## Tips

- Prefer editing on **scan review** so Cargo starts accurate.
- Treat **Estimated** rows as suggestions until you confirm or override.
- Goals and day totals only reflect what is stored on items/meals and what you log on Manifest Eat—see *Nutrition goals and tracking*.

## Related

- *Nutrition overview* — Sources and labels.
- *Receipt scanning* — Review before save.
- *Cargo (pantry inventory)* — Detail and edit.
