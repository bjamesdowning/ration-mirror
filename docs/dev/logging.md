# Logging and observability

Ration stays on Cloudflare-native telemetry: **Workers Logs** (7-day query), **Analytics Engine** (`ration_ops` / `ration_copilot`), **AI Gateway** analytics, and **sampled traces**. There is no Logpush, Tail Worker, Sentry, or notification wiring.

Server code must use [`app/lib/logging.server.ts`](../../app/lib/logging.server.ts) (`log.info` / `warn` / `error` / `critical` / `debug`). Do not call `console.*` in `app/` or `workers/` except inside that wrapper.

## Field dictionary

`log.*` emits a JSON **object** (not a prefixed string) so Workers Logs indexes keys.

| Field | When | Notes |
|-------|------|--------|
| `level` | always | `info` \| `warn` \| `error` \| `critical` \| `debug` |
| `msg` | always | Stable message; keep it short and constant |
| `event` | preferred | Filter key: `mcp_audit`, `oauth_flow`, `queue_consumer_error`, `cron_purge_failed` |
| `cfRay` | fetch | From `cf-ray`; do not add `X-Request-Id` |
| `handler` | ALS | `fetch` \| `queue` \| `scheduled` |
| `worker` | ALS | `ration` \| `ration-mcp` \| `ration-copilot` |
| `queue` | queue | Queue name |
| `jobRequestId` | queue | Redacted job UUID (`redactId`) |
| `cron` | scheduled | Cron expression |
| `versionId` / `versionTag` | when bound | `CF_VERSION_METADATA` |
| `err` | error/critical | `Error.message` + stack only — never the raw `Error` object |

Request context is merged from AsyncLocalStorage in [`ops-context.server.ts`](../../app/lib/ops-context.server.ts). Call-site `context` wins on key conflicts.

## Redaction

- IDs: `redactId()` (first/last 4 chars).
- Emails: `redactEmail()` — almost never log emails; prefer omitting them.
- Never log tokens, cookies, `Authorization`, request bodies, secrets, or raw UUIDs in Analytics Engine blobs.

**Platform limitation:** invocation logs (`$workers.event.request.headers.*`) may still include `authorization` and client IPs. That is Cloudflare’s invocation payload, not `log.*`. Do not enable Logpush (it would copy those headers into long-lived storage). Do not disable `invocation_logs` (you would lose status, latency, and `cf-ray`).

## Query Builder recipes

Workers & Pages → worker → Observability. Custom app fields exist only after the JSON logger deploy.

| Intent | Filter |
|--------|--------|
| Errors | `level eq error` |
| Critical (schema / unhandled) | `level eq critical` |
| MCP write audit | `event eq mcp_audit` |
| OAuth browser flow | `event eq oauth_flow` |
| Queue consumer throw | `event eq queue_consumer_error` |
| Cron failure | `event eq cron_purge_failed` |
| One Cloudflare request | `$workers.event.rayId eq <cf-ray>` or `cfRay eq <cf-ray>` |
| Uncaught Worker exception | `$workers.outcome eq exception` |

Invocation logs (`$cloudflare.$metadata.type` / `$workers.event.*`) already carry method, path, status, `cpuTimeMs`, `wallTimeMs`.

## Traces

Enabled in Wrangler (`observability.traces.enabled`, `head_sampling_rate: 0.1`). Cloudflare auto-instruments handlers, bindings (D1, KV, R2, DO), and outbound `fetch`. No SDK. Unsampled requests incur no tracing overhead.

- **Until 1 Oct 2026:** traces are free in the dashboard (beta).
- **After:** each span is one observability event and **shares the Workers Logs quota** (Workers Paid: 20 million events/month included, then $0.60 per additional million; 7-day retention).

Keep **log** sampling at 100%. Control cost with **trace** sampling only.

## Analytics Engine

Low-cardinality counters via `RATION_ANALYTICS` → `ration_ops` (see [`telemetry.server.ts`](../../app/lib/telemetry.server.ts) and [`docs/fin/51-reliability-and-async-jobs.md`](../fin/51-reliability-and-async-jobs.md)). Never put emails, secrets, or raw UUIDs in `indexes` or `blobs`.

## Out of scope

Logpush, Tail Workers, R2 log archives, OTLP export, third-party APM, and alerting (CF Notifications / Builds Event Subscriptions / `/healthz`). Investigate from the dashboard: Workers Logs, traces, Metrics, Queues, AI Gateway, and `ration_ops` SQL.
