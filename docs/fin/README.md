# Fin knowledge hub (maintainer guide)

This folder holds **customer-facing** Markdown articles for **Intercom Fin** (support) and related sales enablement. They are distilled from the product implementation and [README.md](../../README.md); the app and README remain the source of truth for engineering.

## Collections (Intercom)

Map article groups to Intercom collections for navigation and Fin grounding:

| Collection | Articles |
|------------|----------|
| A — Overview | `01`–`04` |
| B — User flows | `10`–`18` |
| C — Billing & tiers | `20`–`23` |
| D — MCP & API | `30`–`34` |
| E — Security & privacy | `40`–`42` |
| F — Architecture & limits | `50`–`52` |
| G — Troubleshooting | `60`–`61` |
| H — Roadmap (internal) | `70` |

## Authoring rules

- Prefer **Settings** and **screen names** over repository file paths in article bodies. Reserve file paths for advanced MCP/API articles if needed.
- Keep **credit costs**, **tier limits**, **API scopes** (`inventory` / `galley` / `supply` / `mcp` / `mcp:*`), and **MCP tool names** in small tables so retrieval stays precise.
- When user-visible behavior changes, update the relevant `docs/fin/*.md` in the same change as README or product updates when possible.
- **Do not** paste internal-only paths or secrets to customers during support unless troubleshooting with a technical user.

## Release cadence

After releases that affect onboarding, billing, MCP, or security posture, diff [README.md](../../README.md) sections 3–11 and adjust matching articles. [INDEX.md](./INDEX.md) lists example questions for spot-checks.

## Canonical compliance text

Privacy and terms live on the live site under `/legal/privacy` and `/legal/terms`. Articles in this folder **summarize**; they do not replace those pages.
