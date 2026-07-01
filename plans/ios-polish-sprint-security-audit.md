# iOS Polish Sprint — Security Audit

**Date:** 2026-07-01  
**Scope:** Mobile API extensions, supply aggregation, credit transfer, iOS undo/settings editors introduced in the polish sprint.  
**Version audited:** 1.4.13

## Summary

No **CRITICAL** findings. New mobile routes follow existing auth patterns (`requireMobileAuth`, org membership checks, Zod validation, rate limiting). Supply undo is client-local and reversible via existing PATCH — no new server undo token surface yet.

---

## CRITICAL

_None._

---

## HIGH

### H-1: Cook/consume undo — **Resolved (v1.4.14)**

**Area:** Undo reversal  
**Implementation:** `POST /api/mobile/v1/undo` with KV token (5s TTL, userId + orgId bound). Cook and manifest consume routes return `undoToken`. Reversal restores cargo quantities and clears `consumedAt` on manifest entries.  
**Files:** `app/lib/undo-token.server.ts`, `app/lib/cook-reversal.server.ts`, `app/routes/api/mobile/v1.undo.ts`

### H-2: Credit transfer requires owner on source only

**Area:** AuthZ — `v1.groups.credits.transfer`  
**Files:** `app/routes/api/mobile/v1.groups.credits.transfer.ts`  
**Finding:** Destination membership is required but destination role is not restricted (any member can receive). Matches web `transferCredits` behavior.  
**Remediation:** Document in API; consider requiring `owner` on destination for large transfers if abuse appears.

---

## MEDIUM

### M-1: Partial meal PATCH sends full ingredient list from client

**Area:** Input validation / IDOR  
**Files:** `app/routes/api/mobile/v1.meals.$id.ts`, iOS `EditMealView`  
**Finding:** iOS edit sheet re-sends existing ingredients on PATCH. Server merges via `mergeMealPatch` and validates with `MobileUpdateMealSchema.partial()`. Ingredient `cargoId` must still belong to active org (existing meal route checks).  
**Remediation:** Prefer true partial PATCH from iOS (omit unchanged fields) in a follow-up to reduce payload and tamper surface.

### M-2: Manifest settings PATCH partial merge

**Area:** Input validation  
**Files:** `app/lib/schemas/mobile/auth.ts`, mobile settings route  
**Finding:** `manifestSettings` accepts `weekStart` and `calendarSpan` only; `showSnackSlot` / `defaultSlots` not exposed on mobile schema.  
**Remediation:** Extend schema when iOS UI adds those controls; server already merges nested settings on web.

### M-3: Rate limit tier for credit transfer

**Area:** Rate limiting  
**Files:** `rate-limiter.server.ts`, transfer route uses `"credits_transfer"`  
**Finding:** Tier exists and is applied per `user.id`.  
**Remediation:** Monitor 429 rates after TestFlight; tighten if scripted abuse detected.

### M-4: Supply undo is optimistic client buffer

**Area:** Offline / undo  
**Files:** `ios/Ration/Core/Design/UndoToast.swift`, `SupplyViewModel`  
**Finding:** Undo reverts local state and calls PATCH; fails closed when offline (no undo shown without successful toggle).  
**Remediation:** Clear undo buffer on org switch and sign-out (verify `AuthManager.onSignedOut` wipes view models).

---

## LOW

### L-1: PII in transfer success logs

**Area:** PII  
**Files:** `v1.groups.credits.transfer.ts`  
**Finding:** Logs use `redactId` for org and user IDs; no meal/ingredient names.  
**Remediation:** None required.

### L-2: Mobile toggle-active optional servings body

**Area:** Input validation  
**Files:** `v1.meals.$id.toggle-active.ts`  
**Finding:** Optional `{ servings }` coerced server-side; unauthenticated requests rejected by `requireMobileActiveGroup`.  
**Remediation:** Add explicit Zod schema for body in follow-up (currently manual parse).

### L-3: Deleted `ManifestEntryDetailSheet`

**Area:** Attack surface reduction  
**Finding:** Hub manifest entries navigate directly to meal detail; intermediate sheet removed.  
**Remediation:** None.

### L-4: AI consent unchanged

**Area:** AI consent  
**Files:** `AIConsentCoordinator.swift`  
**Finding:** Generate/import/scan still gated; sprint did not bypass consent flows.  
**Remediation:** None.

---

## Audit Matrix (completed)

| Area | Result | Notes |
|------|--------|-------|
| AuthZ (credit transfer) | Pass | Source owner + dest member verified |
| Input validation | Pass | Zod on settings patch, meal partial, transfer schema |
| Rate limiting | Pass | `credits_transfer`, existing meal mutation tiers |
| Undo reversal | Deferred | Supply-only; server token API not shipped |
| PII in logs | Pass | IDs redacted |
| Offline fail-closed | Pass | Transfer/edit require network; supply undo guarded |
| IDOR | Pass | Active org enforced on mobile routes |
| Credit transfer limits | Pass | `TransferCreditsSchema` max 10,000; ledger atomic |
| AI consent | Pass | Unchanged |

---

## Recommended follow-ups

1. Add Vitest integration tests for `v1.groups.credits.transfer` auth matrix (403 non-owner, 403 non-member dest).
2. Add Vitest route tests for `v1.undo` (expired token 410, cross-org rejection).
3. Grep iOS for client-side `aggregateIngredients` — must remain server-only (WS-15 parity).
