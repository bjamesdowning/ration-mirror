# Copilot knowledge hub (maintainer guide)

This folder holds **customer-facing** Markdown articles for Ration Copilot grounding and human self-serve reading. They are distilled from the product implementation and [README.md](../../README.md).

| File | Role |
|------|------|
| [DIRECTORY.md](./DIRECTORY.md) | **Public TOC** — rendered at [`/help`](https://ration.mayutic.com/help); destination for Settings and README links |
| [INDEX.md](./INDEX.md) | Golden-question / retrieval QA table for maintainers |
| [QA-CHECKLIST.md](./QA-CHECKLIST.md) | Spot-check pass after releases |
| `01`–`61` articles | Product how-to SoT (also `/help/:slug`) |
| `70-*` | Internal Copilot capability roadmap (not listed on `/help`) |

Engineering implementation detail remains in the root README. Compliance prose lives in [`docs/legal/`](../legal/). Ops notes live in [`docs/dev/`](../dev/).

## Collections

| Collection | Articles |
|------------|----------|
| A — Overview | `01`–`06` |
| B — User flows | `10`–`19` |
| C — Billing & tiers | `20`–`23` |
| D — MCP & API | `30`–`34` |
| E — Security & privacy | `40`–`42` |
| F — Architecture & limits | `50`–`52` |
| G — Troubleshooting | `60`–`61` |
| H — Roadmap (internal) | `70` |

## Authoring rules

- Prefer **Settings** and **screen names** over repository file paths in article bodies. Reserve file paths for advanced MCP/API articles if needed.
- Keep **credit costs**, **tier limits**, **API scopes**, and **MCP tool names** in small tables so retrieval stays precise. Canonical credit table: `20-credits-explained.md`.
- When user-visible behavior changes, update the relevant `docs/fin/*.md` in the same change as README or product updates when possible, then sync the Copilot AI Search indexes.
- Update [DIRECTORY.md](./DIRECTORY.md) and [INDEX.md](./INDEX.md) when adding articles; register the slug in [`app/lib/help/articles.ts`](../../app/lib/help/articles.ts).
- **Do not** paste internal-only paths or secrets to customers during support unless troubleshooting with a technical user.

## Release cadence

After releases that affect onboarding, billing, MCP, Copilot, or security posture, diff [README.md](../../README.md) sections 3–11 and adjust matching articles. [INDEX.md](./INDEX.md) lists example questions for spot-checks. Sync AI Search per [docs/dev/copilot-ai-search.md](../dev/copilot-ai-search.md).

## Canonical compliance text

Privacy and terms live under `/legal/privacy` and `/legal/terms` (source: [`docs/legal/`](../legal/)). Articles in this folder **summarize**; they do not replace those pages.
