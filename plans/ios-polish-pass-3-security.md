# iOS Polish Pass 3 — Security Audit Gate

Date: 2026-06-30
Version: 1.4.3

## Gate Decision

**Pass** — ship after `bun run test:unit`, `bun run lint`, `bun run typecheck`.

## Scope (new/changed surface)

- Org avatar GET dual auth (cookie session **or** mobile Bearer + membership)
- Hub supply list metadata counts (read-only aggregation)
- Mobile supply snooze: `POST .../supply/items/:id`, `GET .../supply/snoozes`, `DELETE .../supply/snoozes/:snoozeId`
- iOS avatar upload client prep (resize before multipart POST — existing upload routes)

## Checklist

| Area | Threat | Control | Status |
|------|--------|---------|--------|
| Org avatar GET dual auth | IDOR / token bypass | Bearer path uses `verifyMobileAccessToken` + `assertMobileOrgMembership`; cookie path keeps membership query; 404 on failure | Implemented |
| Org avatar GET | Cache leak | `Cache-Control: private` unchanged | Implemented |
| AvatarURLResolver | SSRF | No regression — `/api/*` allowlist only | Verified |
| Avatar upload (iOS) | Oversized payload | Client resize + 2MB pre-check before POST | Implemented |
| Hub metadata counts | Client trust | Counts computed server-side before item slice | Implemented |
| Snooze POST | Cross-org mutation | `getSupplyList` org scope + item list membership | Implemented |
| Snooze GET/DELETE | Cross-org snooze access | `unsnoozeSupplyItem` org-scoped; rate limit `grocery_mutation` | Implemented |
| Snooze duration | Invalid input | `SnoozeItemSchema` enum `24h \| 3d \| 1w` | Implemented |
| Share UI | PII in logs | No URL/token logging in iOS share sheets | Verified |

## Sign-off

Pass 3 extends Pass 2 controls ([`ios-polish-pass-2-security.md`](ios-polish-pass-2-security.md)). No share API changes in this pass.
