# Pre-claim full write access — security & scalability review (v1.3.8)

Assessment of the implemented pre-claim full-write agent onboarding model.

## Summary

The change aligns Ration with industry agent-onboarding patterns (full capability at registration, human claim for ownership) while keeping hard gates on free-tier capacity and abuse-sensitive rate limits. Dual claim recovery (slide + reissue) materially reduces support burden without weakening the bearer-credential security model.

## Security

### Strengths

| Control | Implementation |
|---------|----------------|
| Scope consolidation | Single `AGENT_API_KEY_SCOPES` — no misleading pre/post scope split |
| Claim token storage | SHA-256 hash at rest; raw token only at registration/reissue |
| Reissue auth | Requires valid agent API key bound to `pending_claim` registration |
| Reissue rate limit | `agent_auth_claim_reissue` — 3/hour per key + IP |
| OTP limits | 10-minute TTL, 5 attempts, KV-backed |
| ToS at claim | Zod `tos_accepted: true` + version literal; merge uses max `tosAcceptedAt` |
| Orphan purge | `pending_claim` + `preClaim` only; claimed kitchens never purged |
| Pre-claim write throttle | `mcp_write_preclaim` 10/min org + per key vs 30/min post-claim |
| RLS | All D1 writes remain org-scoped via verified session/API key |

### Residual risks

1. **Bearer credential loss** — If both API key and claim URL are lost, recovery requires support (documented in auth.md). Acceptable for v1; no backdoor without key possession.
2. **Reissue abuse** — An attacker with a stolen API key can rotate claim tokens (3/hour). Mitigated by rate limit; victim should revoke key after claim. Stolen key already implies full kitchen write access.
3. **Pre-claim write surface** — Full MCP write at Tier 0 increases blast radius of a leaked key vs read-only model. Mitigated by free-tier capacity caps, tighter write rate limits, and 180-day idle purge.
4. **Cron purge correctness** — `purgeOrphanAgentKitchens` caps at 25/run; large backlogs drain over multiple days. Acceptable for expected orphan volume.

### Recommendations (future)

- Optional Hub notification when reissue is called (email to stub address if set).
- Metrics on `agent_auth_claim_reissue` 403/429 rates for abuse monitoring.

## Scalability

| Area | Assessment |
|------|------------|
| `slideClaimTokenExpiry` | Fire-and-forget via `waitUntil` on every API key auth — one D1 UPDATE per auth. Acceptable on paid D1; indexes on `agent_registration.organization_id` support lookup. |
| `resolvePreClaimForOrg` | Extra D1 read per MCP request. Consider KV cache keyed by `orgId` if hot-path latency becomes visible. |
| Orphan cron | Batched (25/run), uses join + limit; vector cleanup per org. Safe for daily cron at current scale. |
| Rate limits | KV-backed; pre-claim write limits reduce burst cost on shared free tier. |

## Reliability

| Flow | Failure mode | Handling |
|------|--------------|----------|
| Slide write fails | `waitUntil` — silent; token may expire despite activity | Rare; reissue (Option A) recovers |
| Reissue during OTP | New token invalidates old hash | User must use new URL — expected |
| Capacity at free tier | `capacity_exceeded` with claim hints for `preClaim` | Clear upgrade/claim path |
| D1 contention | `handleApiError` / MCP envelope `retryAfter: 5` | Existing pattern |

## Conclusion

**Ship-ready** for v1.3.8. The model trades a larger pre-claim write surface for better agent UX, with capacity, rate limits, retention policy, and dual recovery paths as compensating controls. No blocking security or scalability issues identified for current scale (10K+ user target).
