# Cargo (pantry inventory)

## What Cargo stores

Each pantry item includes **name**, **quantity**, **unit**, **domain** (food, household, or alcohol), optional **tags**, and optional **expiry date**. The detail page shows linked Galley usage when available.

## Adding items

- Add from the **Cargo** hub screen or flows that **dock** purchases from Supply into inventory.
- When Ration detects a **very similar** existing item, you may be offered **merge** (combine quantity) or **add as new**—this reduces duplicates from scans or slightly different names.

## Receipt scan

After a **receipt scan**, accepted line items ingest through the same dedup logic. Scanning uses **AI credits** (see *Receipt scanning* and *AI credits explained*).

## Domains and tags

Domains separate **food**, **household**, and **alcohol** for filtering and policy. Tags are free-form labels you control for organization in the UI.

## Export and import

Spreadsheet-style **CSV** import/export is available for inventory (limits and formats are shown in the app and API docs). Large imports may use the **REST API** with an API key scoped to inventory.

## Provisions

You can **promote** a cargo item to a **provision** in Galley for quick snacks and simple planning—see *Galley (recipes & provisions)*.

If merge behavior or limits differ from this text, follow the **in-app prompts**.
