# Architecture diagrams

Developer-facing diagrams for the three Cloudflare Workers that make up Ration. Each page has one Mermaid diagram (GitLab renders it inline), a short explanation, and a **Verified against** list of the code paths that back every box and arrow.

| Page | What it shows |
|------|---------------|
| [Request flow](./request-flow.md) | Clients, public hostnames, the `ration`, `ration-mcp` and `ration-copilot` Workers, and the bindings each one has. |
| [Auth: sessions, OAuth and MCP](./auth.md) | Better Auth sessions, the MCP OAuth flow (authorization_code + PKCE + refresh_token, dynamic client registration, loopback redirects), how `ration-mcp` validates tokens and resolves the organization, API keys, and `confirm` gates on destructive tools. |
| [Queue and AI pipeline](./queue-ai-pipeline.md) | Queue producers and consumers, Gemini calls through AI Gateway, Workers AI embeddings, Vectorize indexing, R2 usage, and Copilot AI Search. |

## Conventions

- Names follow [`.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc): **Hub**, **Cargo**, **Galley**, **Meal**, **Manifest**, **Supply**. In code the tenant is a Better Auth **organization**; the UI calls it a group or kitchen.
- Binding names (`DB`, `RATION_KV`, `STORAGE`, …) match `wrangler.jsonc`, `wrangler.mcp.jsonc` and `wrangler.copilot.jsonc`.
- Only public hostnames appear: `ration.mayutic.com`, `mcp.ration.mayutic.com`, `copilot.ration.mayutic.com`. The pages leave out secrets, account IDs, database and KV namespace IDs, and env var values.
- Anything we could not trace to code is left out or marked **(unverified)**.
- Only production config is drawn. The `dev` environments mirror it with `-dev` resources.

## Keeping these current

When a change adds or removes a binding, queue, Worker route, or auth step, update the matching diagram in the same MR. Check it against the files in that page's **Verified against** list. [README.md §1](../../README.md#1-infrastructure-overview) is the architecture overview, and these pages add the detail behind it.
