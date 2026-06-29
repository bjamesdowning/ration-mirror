# iOS Polish Pass 2 — Security Audit Gate

Date: 2026-06-29
Version: 1.4.0 (pre-implementation)

## Gate Decision

**Pass — proceed with implementation** subject to the controls below being enforced in code review.

## Scope

- Avatar URL resolution and authenticated image loading (iOS)
- New mobile avatar upload routes (`POST /api/mobile/v1/user/avatar`, `POST /api/mobile/v1/organization/avatar`)
- New mobile share routes (manifest + supply)
- Hub supply widget toggle (existing PATCH handler)
- Supply item quantity PATCH (existing schema)

## Checklist

| Area | Threat | Required control | Status |
|------|--------|------------------|--------|
| Avatar URL resolver | SSRF / open redirect | Resolve only `/api/*` relative paths against fixed `webOrigin`; allowlist OAuth hosts; reject `javascript:`, `file:`, `data:` | Required in `AvatarURLResolver` |
| Avatar upload | Malware / storage abuse | JPEG/PNG/WebP only, 2MB max, `avatar_upload` rate limit, Bearer auth | Reuse web route logic |
| Org avatar GET | IDOR | Bearer-authenticated fetch via `AuthImageView` + membership-checked GET | iOS client-side |
| Share token generation | Tier bypass / brute force | `canShareMealPlan` / `canShareGroceryLists`, rate limit, org-scoped lookup | Mobile routes |
| Share URL construction | Open redirect | Server builds absolute URL from request origin / env | Mobile routes |
| Supply PATCH qty | Invalid input | Existing `SupplyItemUpdateSchema` Zod | No new surface |
| Hub widget toggle | Cross-org mutation | Existing PATCH validates item against org supply list | No new surface |

## Sign-off

Automated gate checklist complete. Implementation must not merge without passing `bun run test:unit`, `bun run lint`, `bun run typecheck`, and `bun run ios:check`.
