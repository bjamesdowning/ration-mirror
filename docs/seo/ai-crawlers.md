# AI Crawlers and Answer Engines

This document tracks which AI crawlers Ration explicitly allows to access the
public site, and the rationale for each. The source of truth is two places:

1. The application-level `robots.txt` at [app/routes/robots-txt.ts](../../app/routes/robots-txt.ts).
2. The Cloudflare dashboard: **Security → Bots → AI Crawlers & Scrapers**.

Cloudflare may inject an additional managed `robots.txt` block ahead of the
application-served body. To make our intent unambiguous, the application's
`robots.txt` always emits an explicit `User-agent: <bot>` + `Allow: /` block
for every crawler we want to receive content from.

## Allowed AI crawlers

| Bot user-agent       | Operator     | Used for                                          |
| -------------------- | ------------ | ------------------------------------------------- |
| `GPTBot`             | OpenAI       | Training data + ChatGPT browse / search grounding |
| `OAI-SearchBot`      | OpenAI       | ChatGPT Search index                              |
| `ChatGPT-User`       | OpenAI       | On-demand fetches from ChatGPT during chat        |
| `ClaudeBot`          | Anthropic    | Training data                                     |
| `Claude-SearchBot`   | Anthropic    | Claude search/answer index                        |
| `Claude-User`        | Anthropic    | On-demand fetches from Claude during chat         |
| `anthropic-ai`       | Anthropic    | Legacy Anthropic crawler                          |
| `PerplexityBot`      | Perplexity   | Perplexity answer index                           |
| `Perplexity-User`    | Perplexity   | On-demand fetches during a Perplexity query       |
| `Google-Extended`    | Google       | Gemini training + AI Overviews grounding          |
| `Applebot-Extended`  | Apple        | Apple Intelligence training                       |
| `Bytespider`         | ByteDance    | Doubao / TikTok AI training                       |
| `CCBot`              | Common Crawl | Open dataset that powers many LLMs                |
| `meta-externalagent` | Meta         | Llama training + Meta AI                          |
| `FacebookBot`        | Meta         | Meta product crawls                               |
| `Amazonbot`          | Amazon       | Alexa + Amazon Q                                  |
| `DuckAssistBot`      | DuckDuckGo   | DuckAssist AI answers                             |
| `YouBot`             | You.com      | You.com AI answers                                |
| `cohere-ai`          | Cohere       | Cohere training                                   |
| `Diffbot`            | Diffbot      | Knowledge graph data feeding many LLMs            |
| `Timpibot`           | Timpi        | Decentralised search index                        |
| `Omgilibot` / `omgili` | Webz.io    | Web data feed used by AI vendors                  |
| `Webzio-Extended`    | Webz.io      | Webz.io AI training feed                          |

## Required Cloudflare dashboard action

Cloudflare's managed AI Bots block sets `Disallow: /` for many of the bots
above by default. Even with our app-level `Allow`, Cloudflare's WAF rule may
still block the requests at the edge. To get full coverage you must:

1. Open the Cloudflare dashboard for the `ration.mayutic.com` zone.
2. Go to **Security → Bots → AI Crawlers & Scrapers** (sometimes labelled
   "AI Audit" or "Block AI Bots").
3. Set each of the bots in the table above to **Allow** (or disable the
   managed AI bot block entirely if you trust the app-level robots policy).
4. Save and wait for propagation (usually within minutes).
5. Verify with `curl https://ration.mayutic.com/robots.txt` — the application
   block at the bottom should still show explicit `Allow: /` rules for each
   bot, and any prior Cloudflare-injected `Disallow` blocks should be gone.

## Disallowed paths (apply to all crawlers, including AI)

These paths are private and never crawlable, regardless of the user-agent:

- `/api/` — All HTTP API endpoints
- `/hub/` — Authenticated app surface
- `/admin/` — God-mode admin dashboard
- `/invitations/` — One-time invitation links
- `/select-group` — Auth-gated group switcher
- `/shared/` — Tokenised share links
- `/auth/` — Auth flows (verify, callbacks)

## Why we allow AI training

Ration is a small product that benefits from being cited as a source by AI
answer engines. We treat AI ingestion as marketing surface area: every blog
post, marketing page, and tool description that gets surfaced inside an AI
answer is a free distribution channel.

If this stance ever changes (for example, if we begin shipping proprietary
data we do not want trained on), revisit this file and tighten the allowlist
in `app/routes/robots-txt.ts`.
