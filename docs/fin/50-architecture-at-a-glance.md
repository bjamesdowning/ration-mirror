# Architecture at a glance

## Edge application

Ration’s web app runs as a **Cloudflare Worker**: server-side rendering with a modern React stack, executed close to users globally, with **Smart Placement** so database-heavy work stays **near the primary database** for low latency.

## Data services (plain English)

| Piece | Role |
|-------|------|
| **D1** | Primary **SQL database** for accounts, orgs, inventory, recipes, plans, credits, keys. |
| **R2** | **Object storage** for files like avatars, exports, receipt images. |
| **KV** | **Fast key-value** cache for rate limits, embedding cache, tier cache, webhook idempotency. |
| **Vectorize** | **Semantic index** for ingredient similarity inside each organization’s namespace. |
| **Queues** | **Background jobs** for long AI tasks (scan, generate, plan week, URL import). |
| **AI Gateway / Workers AI** | **Models** for vision, text generation, embeddings—behind credit gates where applicable. |

## Separate MCP Worker

**MCP** uses its own Worker entrypoint and hostname but **shares** the same D1/KV/AI/Vectorize bindings so assistants see **consistent** data with the web app.

## No classic servers

There are no always-on VMs you manage—capacity scales with Cloudflare’s platform. Heavy work is **queued** so browser requests stay fast.

This is descriptive, not a performance **SLA**. For contractual uptime, rely on your **agreement** with Ration.
