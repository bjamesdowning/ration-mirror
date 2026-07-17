# Cargo (pantry inventory)

**Cargo** is your pantry inventory for the **active group**. Each item has a **name**, **quantity**, **unit**, **domain** (food, household, or alcohol), optional **tags**, and optional **expiry**. The item detail page shows linked Galley usage when available.

## Domains and tags

Domains separate **food**, **household**, and **alcohol** for filtering and policy. Tags are free-form labels you manage for organization (create/rename/merge under **Settings → Group → Tags**).

## Actions

- **List / filter / search** — Browse Cargo; filter by domain, tags, or status; search by name.
- **Add item** — Enter name, quantity, unit, domain, and optional tags/expiry from Cargo or flows that dock purchases from Supply.
- **Edit item** — Change quantity, unit, name, domain, tags, or expiry on the detail screen.
- **Mark empty** — Set quantity to **0** without deleting the row (keeps a restock reminder).
- **Jettison / delete** — Permanently remove the item from Cargo.
- **Merge or add as new** — When Ration detects a very similar existing item, choose **merge** (combine quantity) or **add as new**.
- **Toggle restock / buy quantity** — Mark an item for Supply restock and set the buy quantity (default 1). Restock lines feed Supply sync.
- **Clear restock** — Remove the restock selection (also cleared or reduced after a successful dock when fulfilled).
- **Promote to provision** — Create a single-ingredient **provision** in Galley from a Cargo item for quick planning. See *Galley (recipes and provisions)*.
- **Receipt / batch ingest** — Accept line items from a **receipt scan** (or batch ingest) through the same dedup/merge path. Scan cost: see *Receipt scanning* and *AI credits explained* (typically **2 credits**).
- **CSV import / export** — Spreadsheet-style import and export (limits and format shown in the app). Large imports may also use the REST API with an inventory-scoped key.
- **Open detail + linked meals** — View full item fields and which Galley meals use this pantry line.

If merge prompts or limits differ from this text, follow the **in-app** controls. Tier capacity for inventory count follows the **owner’s** plan — see *Free vs Crew Member*.
