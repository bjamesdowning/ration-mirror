# Ration v1.5 Full Codebase Audit — July 2026

**Version audited:** 1.5.1  
**Trigger:** Minor release boundary (1.4 → 1.5) / ~50-commit cadence  
**Method:** 8 parallel read-only domain agents → consolidation → small-fix wave  
**Prior audits:** [mcp-security-audit-2026-06.md](mcp-security-audit-2026-06.md), [ios-security-audit-fix-plan.md](ios-security-audit-fix-plan.md)

---

## Executive Summary

Ration's security and platform fundamentals remain **strong**. Auth/RLS, rate limiting on AI endpoints, webhook verification, MCP OAuth/scope enforcement, and D1 batch patterns on hot paths are well-implemented. No new Critical findings were identified.

The audit surfaced **3 High**, **~25 Medium**, and **~35 Low** issues concentrated in:

1. **CI never runs** — GitLab jobs are hidden templates; Definition-of-Done gates are local-only
2. **D1 parameter overflow** — `D1_MAX_INGREDIENT_ROWS_PER_STATEMENT` uses stale divisor (8 vs 10 bound columns) → latent `SQLITE_RANGE` 503s
3. **Migration integrity** — Missing `.sql` files and snapshots in `drizzle/meta/` break fresh DB provisioning
4. **Error-handling inconsistency** — A few API routes mask 400s as 500s or bypass `handleApiError`
5. **Dead code / AI slop** — Orphaned components (web + iOS), stale comments, duplicated helpers

**Small-fix wave (Phase 3)** addresses mechanical items flagged `small-fix: yes`. Medium+ items remain in the recommendation backlog below.

---

## Findings by Severity

### Critical

_None._

### High

| ID | Domain | Finding | Recommendation |
|----|--------|---------|----------------|
| API-001 | Web API | `cargo.batch` catch rewrites validation 400s as 500 | Use `handleApiError(error)` |
| DATA-001 | Data | `D1_MAX_INGREDIENT_ROWS` divisor 8 but rows bind 10 params → 120 > 100 limit | Change divisor to 10; update test |
| DATA-002 | Data | Journal references missing `0006_*.sql` and `0008_*.sql` | Recover from git history or rebuild baseline |
| CI-001 | CI | `.install_dependencies` / `.test_unit` are hidden templates — never run | Rename to concrete jobs |

### Medium

| ID | Domain | Finding | Recommendation |
|----|--------|---------|----------------|
| API-002 | Web API | `plan-week` bypasses `handleApiError` | Fall through to `handleApiError` |
| API-003 | Web API | GDPR purge swallows errors with no logging | Log + `handleApiError` / retry on contention |
| API-004 | Web API | Org cascade-delete duplicated web + mobile | Extract `deleteOrganization()` lib |
| API-007 | Web API | `POST /api/api-keys` has no rate limit or role gate | Add limiter + owner/admin gate |
| LIB-001 | Web Lib | Weak 32-bit cache hash in `vector.server.ts` | Use `crypto.subtle` pattern from import module |
| LIB-003 | Web Lib | Sequential awaits in `applyCargoImport` updates | Chunked `db.batch()` |
| LIB-004 | Web Lib | Sequential awaits in `resolveTagIds` tag creation | Chunked `db.batch()` |
| LIB-005 | Web Lib | Sequential awaits in `importMeals` bulk manifest | Chunked `db.batch()` |
| FE-001 | Frontend | 6 orphaned components (dead code) | Delete |
| FE-002 | Frontend | Full `react-syntax-highlighter` CJS import on blog route | Light build + ESM styles |
| FE-003 | Frontend | `settings.tsx` god-route (2,701 lines) | Extract sections to components |
| FE-004 | Frontend | Inconsistent modal a11y (no dialog semantics) | Shared modal primitive |
| FE-005 | Frontend | PWA doesn't meet offline-first read directive | IndexedDB snapshot or downgrade rule |
| IOS-004 | iOS | Duplicate `session.load` on sign-in | Dedupe `.task` or guard `isLoading` |
| IOS-005 | iOS | Toast timers use uncancellable `DispatchQueue.asyncAfter` | `.task` + `Task.sleep` |
| MCP-001 | MCP | Audit trail never populates `resourceId`/`idempotencyKey` | Thread metadata through `makeTool` |
| MCP-002 | MCP | Docs understate AND-scopes for 3 multi-scope tools | Fix README |
| MCP-003 | MCP | `bulk_add_meal_plan_entries` description vs implementation | Align description or refactor to `db.batch()` |
| MCP-004 | MCP | `update_user_preferences` accepts unvalidated allergen strings | `z.enum(AllergenSlug)` |
| DATA-003 | Data | Missing Drizzle snapshot files (broken meta chain) | Restore or regenerate baseline |
| DATA-004 | Data | Hand-written migrations violate Drizzle-only rule | CI integrity check; stop hand-authoring |
| DATA-005 | Data | `account` table has no indices on auth hot path | Add `userId` + `(providerId, accountId)` indices |
| DATA-006 | Data | GDPR purge omits some org-scoped tables | Explicit delete or cascade test |
| DATA-007 | Data | Vectorize purge not chunked; errors swallowed | Chunk `deleteByIds` or namespace delete |
| CI-002 | CI | No lint/typecheck/flag:check in CI | Add verify jobs |
| CFG-001 | Config | Inconsistent `compatibility_date` across wrangler files | Align to single date |
| CFG-002 | Config | Dev environment defined twice with divergent Stripe vars | Consolidate |
| DEP-001 | Deps | Pinned overrides freeze transitive patches (hono, kysely) | Caret pins or remove when safe |
| DEP-002 | Deps | Majors behind: react-router 8, vite 8, stripe 22 | Schedule upgrades |

### Low (selected)

| ID | Domain | Finding | small-fix |
|----|--------|---------|-----------|
| API-005 | Web API | Delete uses `group_create` rate bucket | no |
| API-006 | Web API | `search` route unguarded D1 call | no |
| API-008 | Web API | Rate limit before method validation | no |
| API-009 | Web API | Misleading "Optional auth" comment | **yes** |
| API-010 | Web API | `meals.generate` swallows malformed bodies | no |
| API-011 | Web API | Large `RATE_LIMITS` registry — verify no dead keys | no |
| API-012 | Web API | Duplicated 429 response construction (~40 routes) | no |
| API-013 | Web API | Unbounded cargo ID fetch on org delete | no |
| API-014 | Web API | Extra capacity check round-trip in batch | no |
| LIB-002 | Web Lib | Duplicate `chunk()` in `meals.server.ts` | **yes** |
| LIB-006–009 | Web Lib | Unbounded import scan, dedup util, cron batching, obug typo | mixed |
| FE-006–013 | Frontend | PWA icons, forwardRef, duplication, tokens, fetch mix, SW fallback | mixed |
| IOS-001–003 | iOS | Dead FloatingAction*, dead `loadConsent` | **yes** |
| IOS-006–010 | iOS | Nonce charset, RNG consistency, anchor helper, PKCE/deeplink tests | **yes** |
| IOS-011–015 | iOS | APIClient retry tests, Swift Testing, ToS social, Retry-After | no |
| MCP-005–008 | MCP | Dead audience check, JSDoc, version constant, Content-Length | **yes** |
| MCP-009 | MCP | June backlog (JTI replay, body buffer, CI deploy) still open | no |
| DATA-008–011 | Data | Session index, queue_job FK, misplaced comment, LIKE purge | mixed |
| DEP-003–004 | Deps | esbuild/vite duplicate specs, unused `pathe` | **yes** |
| SCR-001–002 | Scripts | Orphaned ensure-deps, one-off backfills | mixed |

---

## Verified Clean Areas

- **Auth core:** Session JWT verification, magic-link hashing, personal-org bootstrap, admin double-check
- **Webhooks:** Stripe + RevenueCat signature, replay window, KV idempotency
- **MCP security (June remediations):** Transport caps, batch limits, 500 sanitization, OAuth consent, tenancy — all hold
- **iOS concurrency:** Uniform `@Observable`/`@MainActor`, async/await, single-flight token refresh, Keychain device-only
- **`.server.ts` boundaries:** No server code leaking to client bundles
- **Version sync:** `app/lib/version.ts` matches `package.json`

---

## Small-Fix Queue (Phase 3 — implement now)

| ID | Action |
|----|--------|
| API-009 | Fix misleading comment in `shared.$token.items.ts` |
| DATA-001 | Fix ingredient row divisor (8→10) + test |
| DATA-010 | Move misplaced comment in `schema.ts` |
| LIB-002 | Remove duplicate `chunk()` in `meals.server.ts` |
| FE-001 | Delete 6 orphaned components |
| FE-011 | Move `@types/react-syntax-highlighter` to devDependencies |
| FE-013 | SW navigate fallback to `/hub` for hub routes |
| IOS-001/002 | Delete `FloatingActionBar.swift`, `FloatingAction.swift` |
| IOS-003 | Remove dead `SessionStore.loadConsent` |
| IOS-005 | Fix toast auto-dismiss timers |
| IOS-006 | Restore `W` in Apple nonce charset |
| IOS-007 | Standardize PKCE on `SecRandomCopyBytes` for Apple nonce |
| IOS-008 | Extract shared presentation-anchor helper |
| IOS-009/010 | Add PKCE + auth deep-link tests |
| MCP-002 | Fix README scope columns |
| MCP-004 | Validate allergen slugs at MCP boundary |
| MCP-005/006/007/008 | Dead code, JSDoc, version constant, headers |
| CI-001 | Fix GitLab CI hidden jobs |
| CFG-001 | Align wrangler `compatibility_date` |
| DEP-004 | Remove unused `pathe` devDependency |

---

## Recommendation Backlog (Medium+ — do not auto-implement)

### P0 — Reliability / Security
1. **API-001** — Fix `cargo.batch` error handling (400→500 bug)
2. **API-003** — GDPR purge observability
3. **API-007** — API key creation rate limit + role gate
4. **DATA-002/003** — Restore missing migrations/snapshots
5. **CI-002** — Full CI verify pipeline (lint, typecheck, flag:check, test:unit)

### P1 — Performance / Scale
6. **LIB-001** — Fix embedding cache hash (collision risk)
7. **LIB-003/004/005** — Sequential-write antipatterns → `db.batch()`
8. **DATA-005** — `account` table indices
9. **API-004** — Extract shared org-delete lib
10. **API-012** — `rateLimitResponse()` helper

### P2 — Maintainability / UX
11. **FE-003** — Split `settings.tsx`
12. **FE-004** — Modal accessibility primitive
13. **FE-005** — Offline-first posture decision
14. **MCP-003** — `bulk_add_meal_plan_entries` batch refactor
15. **MCP-001** — Audit trail resourceId population
16. **CFG-002** — Consolidate wrangler dev configs
17. **DEP-002** — Major version upgrades (RR8, Vite 8, Stripe 22)

### P3 — Deferred / Accepted Risk
18. **MCP-009** — JTI replay store, body buffering, MCP CI deploy
19. **IOS-011–015** — APIClient retry tests, write retry UX

---

## Agent Sources

| Agent | Scope | Findings |
|-------|-------|----------|
| 1 | Web API & Auth | API-001–014 |
| 2 | Web Lib | LIB-001–009 |
| 3 | Frontend | FE-001–013 |
| 4 | iOS | IOS-001–015 |
| 5 | MCP | MCP-001–009 |
| 6 | Data Layer | DATA-001–011 |
| 7 | Deps/Config | CI-001–004, CFG-001–003, DEP-001–004, SCR-001–002 |
| 8 | Tests/Docs | Confirms CI-001/002; coverage gaps; stale plans |

---

## Phase 3 Completion (v1.5.2)

All items in the Small-Fix Queue above were implemented in `[v1.5.2]`:

- **Web/MCP/Config:** API-009, DATA-001, DATA-010, LIB-002, FE-001, FE-011, FE-013, MCP-002/004/005/006/007/008, DEP-004, CI-001, CFG-001
- **iOS:** IOS-001/002/003/005/006/007/008/009/010

**Quality gates (all pass):** `test:unit` (1453), `typecheck`, `lint`, `flag:check`, `ios:check` (147 tests)

---

*Generated by v1.5 fanned-out audit process.*
