# Prompt: Generate Implementation Plan for iOS Security & App Store Audit (Critical + High)

> Paste everything below this line into Opus as a single prompt. It is written to run in Plan Mode (read-only research → written plan, no code changes).

---

## Role & Objective

You are planning the remediation of the **2 Critical and 8 High** findings from `plans/ios-security-app-store-audit-2026-06.md` in the Ration iOS app + Cloudflare Workers backend. Produce a **single implementation plan document** (no code changes in this pass) that a team of engineering agents can execute directly, with zero ambiguity, and that would survive scrutiny from:

1. **Apple App Review** (privacy manifest, Universal Links, consent, guideline citations)
2. **A formal security auditor** re-running this same audit methodology (OWASP MASVS v2, GDPR) and finding every item genuinely closed, not just superficially patched
3. **This repo's own Definition of Done** (`.cursor/rules/ration-master.mdc`) — versioning, tests, lint, typecheck, migrations, README

Do not write application code in this pass. The deliverable is the plan itself, saved to `plans/ios-security-audit-fix-plan.md`.

## Required Reading (do this first, yourself, before delegating)

1. `plans/ios-security-app-store-audit-2026-06.md` — full audit, in particular §7 "Prioritized backlog" (Critical + High tables) and every file:line reference cited for CR-1, CR-2, H-1 through H-8
2. `.cursor/rules/ration-master.mdc` — tech stack, D1 hard limits/batch patterns, testing conventions, versioning scheme, migration rules
3. `.cursor/rules/security.mdc`, `.cursor/rules/qa.mdc`, `.cursor/rules/devops.mdc`
4. `plans/app-review-notes.md` — current App Review operator checklist (demo account, Universal Links checklist, sandbox checklist)
5. `app/lib/version.ts` and `package.json` — confirm current version before proposing the bump

**Verify, don't trust, the audit's line numbers.** Code may have drifted since 2026-06-30. Re-locate each finding in the live codebase and re-run the live-verification checks the audit performed (§0): `bun run test:unit`, `bun run typecheck`, `bun run lint`, `bun run ios:check`, and `curl -si https://ration.mayutic.com/.well-known/apple-app-site-association`. Note in the plan if any finding has already changed state.

## Scope — the 10 findings to plan for

**Critical (App Store submission blockers):**
- **CR-1** — No first-party `PrivacyInfo.xcprivacy` in the app target; undeclared Required-Reason API usage (`UserDefaults`, `FileManager`/file timestamp, camera/photo). Apple rejects with `ITMS-91053`/`ITMS-91055`.
- **CR-2** — Production AASA (`/.well-known/apple-app-site-association`) returns HTTP 404 despite the route existing in code (`app/routes/well-known.apple-app-site-association.ts`). Universal Links for magic-link auth are broken in production.
  - **Corrected deploy topology (do not assume manual deploys):** `.gitlab-ci.yml`'s own `deploy` stage is commented out, but that is a red herring — Cloudflare's **Workers Builds** Git integration watches `main` directly and triggers its own build+deploy job on a GitLab runner **outside** `.gitlab-ci.yml` on every push to `main` (this is what `/quick-commit`'s final `git push` actually invokes). Deploys are therefore automatic, not manual.
  - **Real root-cause hypothesis to investigate:** the commit that added/last touched the AASA route almost certainly *did* trigger an auto-deploy, but the operator has observed that these auto-deploys **sometimes fail, causing Cloudflare to roll back to the previous Worker version — silently, with no alert**. The 404 is most likely evidence of a rollback after a failed deploy, not a step that was skipped. Track A must confirm this by correlating (a) the git history of when the AASA route was merged to `main`, against (b) the Cloudflare Workers Builds deployment history/logs for that period (build failures, rollback events).
  - **This changes the fix.** A one-time redeploy only masks the symptom. The durable fix needs: (1) get the current AASA route live now and verify, (2) root-cause *why* deploys intermittently fail (build flakiness? migration-before-deploy ordering? resource limits on the runner?), and (3) a **post-deploy smoke test + failure/rollback alert** so a silent regression like this cannot recur undetected. Treat (3) as the point where CR-2 and H-7 (observability) converge — do not solve them as two unrelated findings; propose one mechanism that closes both.

**High:**
- **H-1** — `POST /scan` (`app/routes/api/mobile/v1.scan.ts`) has no server-side `requireMobileAIConsent`, unlike generate/import/plan-week.
- **H-2** — `AuthManager.signOutLocal()` (forced 401 logout) clears the refresh token but not offline snapshots/session cache/image cache, creating a cross-account data leakage window on shared devices.
- **H-3** — `GET /hub` unbounded parallel fan-out (~10 ops incl. 3× `matchMeals` + full supply list), no rate limit — scale/cost risk at Crew Member (unlimited-inventory) tier.
- **H-4** — `GET /supply` unbounded item fetch, no pagination.
- **H-5** — `GET /meals/match` loads the full org meal catalog with no `preLimit` (unlike the hub widget pattern).
- **H-6** — Orphaned `scan-pending/*` R2 objects on scan failure — no lifecycle rule or cleanup job, unbounded storage cost growth.
- **H-7** — No production observability beyond `console.info/warn/error` — no Sentry/Logpush/Analytics Engine/alerting for the mobile API or queue consumers. **Scope now explicitly includes deploy-pipeline health**: Cloudflare Workers Builds auto-deploys on push to `main` with no alert on build failure or rollback (this is the confirmed/suspected mechanism behind CR-2 — see Track A). A fix that only adds app-level error logging without also closing this deploy-visibility gap has not actually closed H-7 from an auditability standpoint, because the exact failure mode that caused CR-2 would still be invisible.
- **H-8** — AI consent UX/enforcement is inconsistent: scan has a client consent gate but generate/import/plan-week don't (server does enforce on those three — reconcile with H-1's fix so client and server consent gates are symmetric across all four AI entry points).

Do **not** expand scope to the Medium/Low backlog items unless a High-severity fix mechanically requires touching the same code path (e.g., if fixing H-3/H-4/H-5 naturally benefits from the M-9 composite index, call that out as an *optional adjacent improvement* with its own line item, not silently bundled in).

## Non-negotiable constraints from repo rules (bake these into every work item)

- **Versioning:** every code-touching item in the plan must land as its own version bump (`1.X.[1-49]`, roll to `1.(X+1).0` at 50) synced across `package.json` and `app/lib/version.ts`, with `[vX.Y.Z]` in the eventual commit message. Decide up front whether this is one bump per finding or one bump per PR/batch, and be explicit about which.
- **D1 patterns:** any query change (H-3, H-4, H-5) must use `chunkedQuery`/`db.batch()` helpers from `app/lib/query-utils.server.ts`, respect the 100-bound-parameter limit, and any new index must go through `bun run db:generate` (never hand-written SQL in `drizzle/`).
- **Testing:** new pure functions/business logic need Vitest unit tests co-located in `__tests__/`; Zod schema changes need schema tests; iOS changes require `bun run ios:check` evidence (Xcode build + XCTest), not just `swiftc -parse`. Bug fixes (H-2 in particular) need a regression test that would have caught the original bug.
- **Error handling:** use `handleApiError`/`isD1ContentionError` consistently for any touched route.
- **Zero secrets:** if H-7 introduces a third-party observability vendor (e.g., Sentry DSN), the plan must specify `wrangler secret put` and confirm no PII/tokens are logged (per `.cursor/rules/security.mdc` — "PII must never be logged").
- **README:** flag exactly which README sections need updating for each finding (e.g., new observability setup instructions, new AASA deploy verification step in the release checklist).

## Required plan structure

Write `plans/ios-security-audit-fix-plan.md` with:

1. **Executive summary** — sequencing rationale (what must happen before App Store submission vs. what can follow in a post-launch hardening sprint, consistent with the audit's own "Recommended submission sequence")
2. **Dependency graph** — call out ordering constraints explicitly, e.g.:
   - CR-2 (AASA deploy) has no code dependency, but its durable fix is a *process/observability* fix (post-deploy smoke test + failure/rollback alerting on the Cloudflare Workers Builds pipeline), which is the same mechanism H-7 needs for deploy-pipeline visibility. Plan these as one coordinated deliverable, not two.
   - H-1 and H-8 touch the same consent surface (client gate + server gate) — plan them as one coordinated change, not two isolated patches, so the four AI entry points end up symmetric
   - H-3/H-4/H-5 are one "unbounded-read" theme — consider one shared pagination/limit utility rather than three bespoke fixes
3. **Per-finding work item**, each with:
   - Root cause (one paragraph, cite current file:line)
   - Proposed fix, with **at least one alternative approach considered and rejected**, and why (this is what makes it defensible to an auditor — show the reasoning, not just the patch)
   - Explicit mapping to the guideline/standard it satisfies (Apple guideline number, MASVS control ID, or GDPR article) so the fix is traceable in a re-audit
   - Files touched
   - Test plan (unit/regression/ios:check as applicable) — name the specific test file(s) to add
   - Verification step to prove the fix in production (e.g., "re-run the exact `curl` command from audit §0 and paste output"; "physical-device Universal Link tap test"; "confirm `PrivacyInfo.xcprivacy` via Xcode → Product → Generate Privacy Report")
   - Rollback plan
   - Effort estimate (S/M/L)
4. **Cross-cutting decisions log** — see clarification questions below; this section should show resolved decisions once you have answers, not just restate the open questions
5. **Consolidated version-bump plan** — the exact version sequence this work will consume
6. **Post-plan Definition of Done checklist** — restate the repo's DoD as a literal checklist mapped to this plan's outputs

## Parallelization strategy — you must use subagents for research, not do it all serially

Context efficiency matters: each subagent should read only what it needs, and report back a **short structured brief**, not full file dumps, so the synthesis step doesn't drown in redundant context. Use this decomposition (adjust if your own research reveals a better split, but keep the "small brief, not raw dump" contract):

- **Track A — App Store submission blockers (CR-1, CR-2).** Research: current `Info.plist`/entitlements/Required-Reason API usage inventory (`UserDefaults`, `FileManager`, camera/photo, any others you find via grep), Apple's current Privacy Manifest documentation (fetch latest, don't rely on training data — do a web check since Apple updates reason codes periodically), and the **actual** deploy topology: Cloudflare Workers Builds triggers an auto-deploy on every push to `main` via a GitLab runner job that lives outside `.gitlab-ci.yml`. Pull the Cloudflare dashboard's deployment history for the Worker and correlate failed/rolled-back deploys against the git log for when the AASA route was merged — confirm or refute the "silent rollback" hypothesis with evidence (timestamps, build logs), don't just assert it. Brief should return: the exact manifest content to ship, the exact verify sequence for AASA once live, the confirmed root cause of the 404 with evidence, and a concrete post-deploy smoke-test/alerting mechanism (feeds into Track D / H-7).
- **Track B — Client-side session & consent integrity (H-1, H-2, H-8).** Research: `AuthManager.swift` full sign-out paths (forced vs explicit), `SnapshotStore.swift`, `SessionStore.swift`, `AIFeatureIntroView.swift`, `PrivacySettingsView.swift`, and the server-side `requireMobileAIConsent` middleware. Brief should return a **symmetric design** for consent across scan/generate/import/plan-week (client + server) and a precise snapshot/cache-wipe sequence for forced logout that doesn't regress the org-switch-clears-snapshots behavior (C-S2) or explicit-sign-out behavior (C-A10).
- **Track C — Backend read-path scale (H-3, H-4, H-5).** Research: `v1.hub` route + `matchMeals`, `v1.supply` route, `v1.meals.match` route, existing `preLimit` pattern used elsewhere in the hub widgets, `rate-limiter.server.ts` for how to add read-path limits consistently. Brief should return whether a shared pagination/limit helper makes sense vs. three separate fixes, plus rate-limit tiers to apply to the previously-unrated GET endpoints named in B-R4/M-4 (only if trivially bundled — otherwise note as adjacent Medium work, out of scope).
- **Track D — Infra hardening (H-6, H-7).** Research: R2 lifecycle rule support in the current `wrangler.jsonc` binding, existing cron job (daily 03:00 UTC purge) as a possible extension point for orphan cleanup, and observability options appropriate for a paid Cloudflare Workers plan — compare Cloudflare-native (Logpush + Analytics Engine) vs. Sentry, considering the "no Node.js APIs" runtime constraint and the security rule that PII must never be logged. **Also research Cloudflare Workers Builds' native deployment notification options** (webhooks, dashboard alerts, Deployments API) as the primary candidate for closing the deploy-pipeline-visibility half of H-7 — this should be evaluated alongside, and likely coordinated with, Track A's CR-2 findings rather than designed in isolation. Brief should return a recommendation with a one-paragraph justification, not an open-ended menu.

**Context-sharing protocol:** each track writes its brief as a scratch file (e.g., `plans/.scratch/track-a-findings.md`) rather than pasting full content back into the main thread. After all tracks complete, do a synthesis pass that reads only the briefs (not the original raw research) to assemble the final plan, resolving the cross-cutting dependencies called out above. Delete or fold the scratch files into the final plan doc rather than leaving them as permanent repo artifacts.

## Clarification — ask before finalizing

Stop and ask me directly (don't guess and silently pick one) on any of the following if your research doesn't resolve them cleanly:

1. **Observability vendor (H-7):** Cloudflare-native (Logpush/Analytics Engine, no new vendor, no new secret) vs. Sentry (richer error grouping/alerting, but a new third-party DSN + secret to manage). Do you have a preference or existing account?
2. **R2 cleanup mechanism (H-6):** native R2 lifecycle rule (declarative, no code) vs. extending the existing daily cron purge job (more control, consistent with existing orphan-cleanup pattern). Any preference?
3. **Forced-logout snapshot wipe (H-2):** should this be a full wipe (simplest, matches explicit sign-out) or does losing all offline data on a *forced* 401 logout create a bad UX (e.g., user momentarily loses connectivity, gets 401'd, loses cached pantry view)? Is a full wipe acceptable, or do we need org-scoped wipe + re-fetch-on-next-login instead?
4. **Deploy pipeline reliability (CR-2 root cause):** Deploys are automatic via Cloudflare Workers Builds on push to `main`, and these auto-deploys are known to fail intermittently, triggering a silent rollback. Is root-causing *why* these builds fail (e.g., flaky dependency install, migration timing, runner resource limits) in scope for this plan, or should this plan only add the detection/alerting layer (so failures are visible) and treat the underlying flakiness as a separate follow-up investigation?
5. **Demo account for App Review:** `app-review-notes.md` still says "pending" — do you already have a dedicated test email/TestFlight note, or does this plan need to include creating one?
6. **AI consent UX copy (H-8 + N-3 adjacent):** should generate/import/plan-week get the *same* full-screen consent intro as scan, or a lighter inline gate, given the server already enforces consent on those three?

If I haven't answered these by the time you'd otherwise finalize, present your best-practice default for each with a one-line rationale, mark it clearly as an **assumed default pending confirmation**, and proceed — do not block the entire plan on unanswered questions.

## Definition of done for this planning pass

- `plans/ios-security-audit-fix-plan.md` exists, covers all 10 findings with the structure above
- Every fix cites the Apple guideline / MASVS control / GDPR article it closes
- Every fix has an alternative-considered rationale
- The parallel research tracks' briefs are folded in and not left as loose scratch files
- Open clarification questions (if any remain unanswered) are listed at the top of the plan, not buried
- No application code, migrations, or config changes were made — this is plan-only
