# Copilot article index

Use this table for Copilot AI Search source configuration and **golden-question** QA. Public browsing starts at [DIRECTORY.md](./DIRECTORY.md) (`/help`). See [QA-CHECKLIST.md](./QA-CHECKLIST.md) for a condensed test pass.

| File | Suggested title | Audience | Example questions |
|------|-----------------|----------|-------------------|
| [01-what-is-ration.md](./01-what-is-ration.md) | What is Ration? | Both | What does Ration do? Is Ration a meal kit? Can teams share a pantry? What is Ask Ration / Copilot? What is MCP? Can AI control my kitchen? |
| [02-key-concepts.md](./02-key-concepts.md) | Key concepts: Cargo, Galley, Manifest, Supply | Both | What is Cargo vs Galley? Where do credits live? What is an organization? |
| [03-account-and-sign-in.md](./03-account-and-sign-in.md) | Account and sign-in | Support | How do I log in? Does Ration support Google? What is magic link email? |
| [04-switching-groups.md](./04-switching-groups.md) | Switching groups (organizations) | Support | How do I change household? Is my data shared between groups? |
| [05-groups-membership.md](./05-groups-membership.md) | Groups and membership | Support | How do I invite someone? Transfer ownership? Transfer credits? Can I leave a group? |
| [06-ask-ration-vs-reading-docs.md](./06-ask-ration-vs-reading-docs.md) | Ask Ration vs reading the guide | Support | Where is the user guide? Does Ask Ration use the same docs? |
| [10-cargo-inventory.md](./10-cargo-inventory.md) | Cargo (pantry inventory) | Support | How do I add pantry items? Why did it ask to merge? What is mark empty? Restock? |
| [11-receipt-scan.md](./11-receipt-scan.md) | Receipt scanning | Support | How does scan work? How many credits is a scan? Why is scan processing? |
| [12-galley-recipes.md](./12-galley-recipes.md) | Galley (recipes & provisions) | Support | How do I add a new meal? What is a provision? How do I cook a meal? |
| [13-add-meals-url-import.md](./13-add-meals-url-import.md) | Import a recipe from a URL | Support | Can I import from a website? How much does URL import cost? |
| [14-ai-meal-generation.md](./14-ai-meal-generation.md) | AI meal generation | Support | How do I generate recipes from my pantry? How many credits? |
| [15-manifest-meal-plan.md](./15-manifest-meal-plan.md) | Manifest (meal plan) | Support | How do I plan meals for the week? What is consume? Can I share Manifest? |
| [16-supply-shopping-list.md](./16-supply-shopping-list.md) | Supply (shopping list) | Support | How do I update my shopping list? What is snooze? What is dock? |
| [17-matching-cookable-meals.md](./17-matching-cookable-meals.md) | Matching cookable meals | Support | What does “meals ready” mean? Strict vs partial match? |
| [18-hub-dashboard-and-settings.md](./18-hub-dashboard-and-settings.md) | Hub dashboard and settings | Support | Where is pricing? Connected Agents? API keys? How do I delete my account? |
| [19-kitchen-loop.md](./19-kitchen-loop.md) | The kitchen loop | Both | How do Cargo, Galley, Manifest, and Supply fit together? |
| [20-credits-explained.md](./20-credits-explained.md) | AI credits explained | Both | What uses credits? Do MCP calls use credits? Who shares the balance? |
| [21-buying-credits-and-stripe.md](./21-buying-credits-and-stripe.md) | Buying credits and checkout | Support | Checkout failed; credits missing? Billing portal? How do I cancel? |
| [22-subscription-tiers.md](./22-subscription-tiers.md) | Free vs Crew Member | Both | Why can’t I invite someone? Free tier limits? Who sets tier for a group? |
| [23-welcome-offer-and-promotions.md](./23-welcome-offer-and-promotions.md) | Welcome credits | Sales, Support | Do new accounts get free credits? |
| [30-mcp-overview.md](./30-mcp-overview.md) | MCP overview | Support | What is Ration MCP? How do I connect my AI agent? Which scopes? |
| [31-mcp-connection-setup.md](./31-mcp-connection-setup.md) | Connecting to MCP | Support | How do I connect Claude or Cursor? OAuth setup? |
| [32-mcp-tools-reference.md](./32-mcp-tools-reference.md) | MCP tools reference | Support | List all MCP tools. Rate limits for MCP. |
| [33-mcp-vs-web-app.md](./33-mcp-vs-web-app.md) | MCP vs web app capabilities | Support | Can I scan receipts via MCP? Is plan week in MCP? |
| [34-rest-api-v1-overview.md](./34-rest-api-v1-overview.md) | REST API (v1) overview | Support | Export inventory CSV? REST vs MCP scopes? |
| [40-security-overview.md](./40-security-overview.md) | Security overview | Both | How is Ration secured? Sessions? Multi-tenant isolation? |
| [41-data-and-privacy.md](./41-data-and-privacy.md) | Data, privacy, and deletion | Both | Where is privacy policy? What happens when I delete my account? |
| [42-api-key-safety.md](./42-api-key-safety.md) | API key safety | Support | Are API keys stored in plain text? How do I rotate a key? |
| [50-architecture-at-a-glance.md](./50-architecture-at-a-glance.md) | Architecture at a glance | Both | What cloud does Ration use? D1, R2, what are they in plain English? |
| [51-reliability-and-async-jobs.md](./51-reliability-and-async-jobs.md) | Async jobs and reliability | Support | Why is my scan still processing? Will I lose credits if it fails? |
| [52-limits-and-rate-limits.md](./52-limits-and-rate-limits.md) | Limits and rate limits | Support | How many scans per minute? MCP throttling? |
| [60-troubleshooting-common.md](./60-troubleshooting-common.md) | Common troubleshooting | Support | Not enough credits; wrong group; can’t share. |
| [61-billing-issues.md](./61-billing-issues.md) | Billing troubleshooting | Support | Paid but no credits yet; subscription status. |
| [70-copilot-chat-capability-roadmap.md](./70-copilot-chat-capability-roadmap.md) | Copilot chat: capability rollout | Internal | What should Ask Ration learn next? |

**Sales objection handling:** prioritize `01`, `02`, `19`, `20`, `22`, `40`, `41`, `50`.

If an answer from Copilot disagrees with the live app, the **app wins**—update the article and sync the AI Search indexes.
