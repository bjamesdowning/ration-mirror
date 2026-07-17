# Copilot / user guide QA checklist

Run after releases that change onboarding, billing, MCP, Copilot, kitchen flows, or docs. Articles live in `docs/fin/` (public at `/help`). Sync AI Search after content changes — see [docs/dev/copilot-ai-search.md](../dev/copilot-ai-search.md).

## Before QA

1. Confirm [`DIRECTORY.md`](./DIRECTORY.md) lists every customer article and matches [`app/lib/help/articles.ts`](../../app/lib/help/articles.ts).
2. Spot-check free-tier numbers against `TIER_LIMITS` in code (expect **35** inventory / **15** meals / **3** supply lists unless Pricing says otherwise).
3. Spot-check credit costs against [`20-credits-explained.md`](./20-credits-explained.md) and Pricing.
4. Upload corpus and reindex (`docs/fin`, `content/blog`, `docs/dev`, `docs/legal`, root `README.md`).

## Golden questions (Ask Ration + `/help`)

Ask each in Ask Ration (with `search_docs`) and optionally open the matching `/help/:slug` page.

| # | Question | Expect article / theme |
|---|----------|------------------------|
| 1 | What is Cargo vs Galley? | `02`, `10`, `12` |
| 2 | How do I invite someone to my household? | `05`, `22` |
| 3 | Can I leave a group? | `05` (no first-class leave) |
| 4 | What actions can I take on a Cargo item? | `10` |
| 5 | How does the kitchen loop work? | `19` |
| 6 | How many credits is a receipt scan? | `20`, `11` |
| 7 | Free tier inventory limit? | `22` → 35 |
| 8 | How do I connect Claude via MCP? | `31` |
| 9 | Where is the privacy policy? | `41` → `/legal/privacy` |
| 10 | Paid but credits missing? | `61`, `21` |

## `/help` surface

- [ ] `/help` renders DIRECTORY and links resolve to `/help/:slug`
- [ ] Settings → Help → User guide opens `/help` (web)
- [ ] iOS Settings → User guide opens `https://ration.mayutic.com/help`
- [ ] Maintainer files (`README`, `INDEX`, `QA-CHECKLIST`, `70-*`) return 404 at `/help/:slug`

## Pass criteria

- Answers match live app behavior for the release under test.
- No Fin/Intercom-only instructions in customer articles.
- When live billing tools disagree with docs, tool data wins (already in Copilot system prompt).
