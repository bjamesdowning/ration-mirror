# iOS Security & App Store Audit — Fix Implementation Plan

**Source audit:** [`plans/ios-security-app-store-audit-2026-06.md`](ios-security-app-store-audit-2026-06.md) (2026-06-30, app version 1.4.5)
**This plan generated:** 2026-07-01, re-verified against live code/production at that date (see §0 below — code drifted since the audit; see the CR-2 re-scope in particular).
**Scope:** CR-1, CR-2, H-1 through H-8 (2 Critical + 8 High). Medium/Low items are explicitly out of scope except where noted as "optional adjacent" line items with their own effort estimate.

---

## Status of clarification questions

All six clarification questions from the planning prompt were put to the operator. Four were answered directly; two were left to best-practice default (explicitly marked below, per the prompt's own instruction to proceed with a marked default rather than block).

| # | Question | Resolution |
|---|----------|------------|
| 1 | Observability vendor (H-7) | **Answered: Cloudflare-native** (Analytics Engine + Logpush; no Sentry, no new secret) |
| 2 | R2 cleanup mechanism (H-6) | **Answered: native R2 Object Lifecycle Rule** (not cron extension) |
| 3 | Forced-logout wipe scope (H-2) | **Answered: full wipe**, identical to explicit sign-out |
| 4 | Deploy-flakiness root-cause depth (CR-2) | **Assumed default (pending confirmation):** this pass ships detection/alerting only. This is now moot in the way originally framed — see §CR-2 below, where live evidence *refutes* the audit's premise that deploys are flaky. Detection/alerting is still being added, but as a general future-proofing measure, not because active flakiness was found. |
| 5 | Demo account for App Review | **Assumed default (pending confirmation):** create a dedicated, team-monitored inbox (e.g. `appreview@mayutic.com`) and document a monitoring commitment in `plans/app-review-notes.md`. Zero code change — operational/documentation only, not part of the version-bump sequence below. |
| 6 | AI consent UX symmetry (H-8) | **Answered: one shared full-screen consent gate**, shown once on the first-ever AI action across all four entry points (scan/generate/import/plan-week), not re-shown per-feature once `aiConsentAt` is set. |

---

## 0. Live re-verification (2026-07-01) — what changed since the 2026-06-30 audit

Per the planning prompt's instruction to verify, not trust, the audit's findings, all live checks were re-run before writing this plan:

| Check | Result | Note |
|---|---|---|
| `bun run test:unit` | **Pass** — 131 files, 1199 tests | Unchanged from audit |
| `bun run typecheck` | **Pass** | Unchanged |
| `bun run lint` | **Pass** — 718 files | Unchanged |
| `bun run ios:check` | **Pass** — 58 XCTest cases | Unchanged |
| Production AASA (`curl -si https://ration.mayutic.com/.well-known/apple-app-site-association`) | **Still `HTTP/2 404`**, empty body, no `Content-Type` | CR-2 still open |
| All sibling `.well-known/*` routes (`api-catalog`, `oauth-authorization-server`, `openid-configuration`, `mcp/server-card.json`, `agent-skills/index.json`) | **All `HTTP/2 200`, `application/json`** | New data point not in the original audit — see below |
| `wrangler deployments list` | Clean, continuous deploy history; every commit on `main` back to 2026-06-29 correlates with a deployment 1-90 minutes later (consistent with normal CI latency) | New data point — see below |

### CR-2's root cause has changed since the audit was written — this is the single most important correction in this plan

The audit and the planning prompt both hypothesized that CR-2 (AASA 404) is caused by **Cloudflare Workers Builds silently rolling back a failed auto-deploy**. Live investigation in this pass **refutes that hypothesis** with direct evidence:

1. `wrangler deployments list` shows an unbroken chain of successful deployments, one per commit, with deploy timestamps trailing commit timestamps by 2–90 minutes (normal build latency) all the way through the most recent commit on `main`. There is no gap, no stale version pinned at 100% traffic, and no evidence of a rollback event.
2. The AASA route (`app/routes/well-known.apple-app-site-association.ts` + `app/lib/aasa.ts`) is registered in the **exact same `app/routes.ts` route table**, in the **exact same build**, as five other `.well-known/*` routes — and **every one of those siblings returns `200` in production right now**, on the currently-live Worker version. If the deployed Worker were stale/rolled-back, either all six `.well-known/*` routes would be affected together (they aren't) or none would (also not what we see).
3. The AASA loader itself is unconditional code with no branch that can produce a 404 (`return Response.json(buildAppleAppSiteAssociation(), {...})`, no error paths).
4. The 404 response has **no `Content-Type` header and `Content-Length: 0`** — a signature inconsistent with a Worker-generated JSON 404 (React Router / this Worker's error handler always sets a body + content-type) and far more consistent with an **edge-level intercept that short-circuits before the Worker runs**.

**Corrected root-cause hypothesis (highest confidence, pending human dashboard confirmation — see CR-2 work item):** a Cloudflare **zone-level Rule** (Redirect Rule, Configuration Rule, or legacy Page Rule) matching the literal path `/.well-known/apple-app-site-association`, most likely a leftover from an earlier, pre-Worker attempt to host the AASA file directly at the Cloudflare zone level, is intercepting the request before it reaches the Worker. Cloudflare's own Rules documentation explicitly warns that generic zone-level rules can affect `.well-known/*` paths and recommends excluding them — this is a documented, known class of issue, not a novelty.

This changes CR-2's fix from "redeploy" (the audit's original fix text) to "**a Cloudflare dashboard Rules audit + removal**, which is a human/operator action requiring Cloudflare zone-dashboard access the coding agent does not have in this environment," decoupled from any code change. It also means H-7's "post-deploy smoke test" should not be framed as *the* CR-2 fix (it wouldn't have prevented this, since this isn't a deploy-failure class of bug) but as a **general future-regression detector** that happens to also catch this class of bug going forward, alongside genuine deploy failures.

---

## 1. Executive summary

**Submission-blocking sequence (must happen before App Store Connect upload):**

1. **CR-1** (privacy manifest) — pure iOS build-config change, no backend dependency, no coordination needed. Ship first.
2. **CR-2** (AASA 404) — root cause is now believed to be a Cloudflare zone Rule, not code. The *fix* is an operator dashboard action with no version bump. The *verification tooling* (smoke test) ships as part of the H-7 batch and is not itself a submission blocker, but the **AASA fix must land before physical-device Universal Link testing and before final submission**, independent of the code work in this plan.
3. **H-1 + H-8** (AI consent symmetry) — the audit's #3 top risk. Ship before submission; consent-gate parity across all four AI entry points is squarely an App Review §5.1.1(i)/§5.1.2 concern.
4. **H-2** (forced-logout wipe) — the audit's #4 top risk (cross-account data leakage on shared devices). Ship before submission; this is a real security regression on shared/family devices, not just a hardening nice-to-have.

**Post-submission hardening sprint (can follow in parallel with App Review, per the audit's own recommended sequence):**

5. **H-3 + H-4 + H-5** (unbounded read paths: hub, supply, meals-match) — scale risk that only bites at Crew Member (unlimited-inventory) tier; not a submission blocker, no user-facing behavior change at current scale.
6. **H-6 + H-7** (R2 lifecycle + observability + deploy visibility) — infra hardening; genuinely improves operational safety but has no bearing on App Review outcome.

This sequencing matches the audit's own §8 "Recommended submission sequence," with one correction: CR-2's fix is no longer "deploy the Worker" (it's already deployed) but "audit and fix a Cloudflare zone Rule," which the coding agent cannot do directly — flagged clearly in the CR-2 work item below as a human action item with an exact dashboard path.

---

## 2. Dependency graph

```
CR-1 (Privacy Manifest)
  — no dependencies, ships alone — v1.4.6

CR-2 (AASA 404 root cause) ─┐
                             ├─→ ONE coordinated deliverable: v1.4.7
H-7 (Observability + deploy  │     - CR-2's *code* contribution: the smoke-test/notifier consumer
     visibility) ────────────┤       Worker's AASA check (this is the "post-deploy smoke test" the
                             │       audit called for, generalized to catch any future regression
H-6 (R2 lifecycle) ─────────┘       class, not just deploy failures)
                                   - CR-2's *actual fix* (removing/fixing the Cloudflare zone Rule)
                                     is a human dashboard action with NO code and NO version bump —
                                     tracked as its own checklist item, done whenever operator has
                                     dashboard access, not gated on v1.4.7 shipping
                                   - H-6 (R2 lifecycle rule) is also a zero-code operator action,
                                     documented in this same release's README changes but not itself
                                     versioned

H-1 (scan server consent) ─┐
                            ├─→ ONE coordinated deliverable: v1.4.8
H-8 (client consent symmetry)┘    (same consent surface — client gate + server gate — must land
                                    together so all 4 AI entry points end up symmetric; shipping H-1
                                    alone would close the server gap but leave 3 client UIs
                                    inconsistent; shipping H-8 alone would add client UI with no
                                    matching server enforcement on /scan)

H-2 (forced-logout wipe) + M-12 (pkce verifier cleanup, same method) — v1.4.9
  — independent of H-1/H-8 (different surface: session/cache lifecycle, not consent).
    Bundling M-12 costs zero extra risk since it's the same signOutLocal() edit.

H-3 + H-4 + H-5 (unbounded read paths) — v1.4.10
  — one "unbounded-read" theme per the planning prompt's instruction, but implemented as
    3 narrow, independently-reviewable fixes (not one new generic utility — see Track C
    finding: the existing preLimit/options-object patterns are sufficient; a new abstraction
    would add indirection without saving code). H-3's supply-count fix has a real internal
    dependency: the hub's full-list-count logic must not silently break if H-4 changes
    getSupplyListById's default behavior — sequenced as H-4's schema-safe default (no limit
    unless explicitly passed) first, then H-3 opts in explicitly.

Optional adjacent (NOT bundled, tracked as separate Medium-severity follow-ups):
  - M-9 (organizationId, createdAt composite index) — would help H-3/H-5's query plans but
    is a schema migration; land as its own PR immediately after v1.4.10, not inside it.
  - B-R4/M-4 (rate limits on /session, /billing/status, /orgs) — same rate-limiter pattern
    as H-3/H-4 but a distinct Medium backlog line; fast-follow, not bundled.
  - N-3/L-6 (Privacy Settings footer copy vs. PATCH behavior) — one-line copy fix, unrelated
    view to H-8; fast-follow, not bundled.
```

---

## 3. Per-finding work items

### CR-1 — Missing first-party `PrivacyInfo.xcprivacy`

**Root cause:** No `PrivacyInfo.xcprivacy` exists anywhere under `ios/Ration/` (confirmed absent repo-wide, both by the original audit and re-confirmed in this pass). The app uses three Required-Reason API categories without declaration: `UserDefaults.standard` ([`NextActionDismissStore.swift:9,15`](../ios/Ration/Core/Filters/NextActionDismissStore.swift)), `FileManager` file-timestamp access for the offline snapshot cache ([`SnapshotStore.swift:20`](../ios/Ration/Core/Persistence/SnapshotStore.swift)), and camera/photo picker APIs ([`ScanView.swift:320-345`](../ios/Ration/Features/Scan/ScanView.swift) — these are *not* Required-Reason categories themselves, already covered by existing `Info.plist` usage strings, but the manifest omission is what triggers Apple's automated `ITMS-91053`/`ITMS-91055` rejection at upload).

**Proposed fix:** Add `ios/Ration/App/PrivacyInfo.xcprivacy` declaring:
- `NSPrivacyAccessedAPICategoryUserDefaults` → reason `CA92.1` (app-container-only access)
- `NSPrivacyAccessedAPICategoryFileTimestamp` → reason `C617.1` (own app container files only — not `DDA9.1`/`3B52.1`, since snapshot timestamps are never displayed to the user nor derived from user-picked files)
- `NSPrivacyTracking: false`, empty `NSPrivacyTrackingDomains` (no ad/tracking SDKs in `project.yml`)
- `NSPrivacyCollectedDataTypes`: Email Address (linked, app functionality), Photos/Videos (linked, app functionality — receipt/avatar images), Other User Content (linked, app functionality — inventory/meal data)

Reason codes were verified against Apple's live 2026 Required-Reason API documentation (not training data) — no codes have been added/deprecated since the audit's original suggestion; `CA92.1`/`C617.1` remain correct.

Also add an explicit `fileTypes.xcprivacy` override to `ios/project.yml`:
```yaml
options:
  fileTypes:
    xcprivacy:
      buildPhase: resources
```
This is necessary because XcodeGen's default handling of `.xcprivacy` files has changed across releases (sometimes `resources`, sometimes `buildPhase: none`), and this repo does not pin an XcodeGen version — without the explicit override, the file could silently be excluded from "Copy Bundle Resources" depending on which XcodeGen version a given machine/CI runner has installed, which would look correct locally but fail Apple's automated check on upload.

**Alternative considered and rejected:** Rely on XcodeGen's default file-type inference (no `project.yml` override) and just add the `.xcprivacy` file. Rejected because it creates a latent, version-dependent risk of silent omission from the bundle — the failure mode would only surface at App Store Connect upload time (or via a manual "Generate Privacy Report" check), which is exactly the kind of late-stage, hard-to-diagnose failure this plan is trying to eliminate. The explicit override costs three lines and removes the ambiguity entirely.

**Guideline/standard mapping:** Apple Privacy Manifest requirement (enforced since May 2024, submission-blocking via `ITMS-91053`/`ITMS-91055`); App Review Guideline §5.1.1(i) (Data Collection and Storage) and §5.1.2 (Data Use and Sharing); OWASP MASVS v2 **MASVS-PRIVACY-1** (the app minimizes and discloses collection of sensitive data).

**Files touched:**
- New: `ios/Ration/App/PrivacyInfo.xcprivacy`
- Modified: `ios/project.yml` (add `fileTypes.xcprivacy` override)
- Regenerated (not hand-edited): `ios/Ration.xcodeproj` (via `bun run ios:generate`)

**Test plan:** No new Vitest/XCTest logic is introduced (this is a static manifest, not code) — the applicable "test" is the build/inspection sequence below, run as evidence for `bun run ios:check` per the repo's iOS QA gate. Re-run the full `bun run ios:check` suite (58 existing XCTests) to confirm the added resource doesn't break project generation, codesigning, or the build.

**Verification step (production-grade, not just "it compiles"):**
1. `bun run ios:generate`; open the generated project and confirm `PrivacyInfo.xcprivacy` appears under **Ration target → Build Phases → Copy Bundle Resources**.
2. Xcode → **Product → Archive** (Release config), then **Product → Generate Privacy Report** — confirm the generated report lists exactly `UserDefaults (CA92.1)` and `File timestamp (C617.1)` for the app target, plus RevenueCat's own bundled `UserDefaults (CA92.1)` + Purchase History entries for the SDK, with **no undeclared-API warnings**.
3. Cross-check the App Store Connect **App Privacy** questionnaire (separate UI from the manifest) declares matching data types (Email Address, Photos/Videos, Other User Content, Purchase History via RevenueCat), all "used for app functionality," none for tracking.
4. `bun run ios:check` passes (58/58).

**Rollback plan:** Remove `PrivacyInfo.xcprivacy` and the `project.yml` override, regenerate the project. Zero runtime behavior depends on this file (it only affects App Store Connect's automated compliance check), so rollback has no user-facing effect and no data-migration concerns.

**Effort estimate:** S

---

### CR-2 — Production AASA returns HTTP 404

**Root cause:** See §0 above for the full evidence trail. **Corrected from the audit's original hypothesis.** The audit assumed a silent Cloudflare Workers Builds rollback; live evidence in this pass refutes that (clean, gap-free deploy history; every sibling `.well-known/*` route on the identical currently-deployed Worker returns 200; the loader code itself is unconditional and correct). The far more likely cause is a **Cloudflare zone-level Rule** (Redirect Rule / Configuration Rule / legacy Page Rule) matching the literal path `/.well-known/apple-app-site-association`, intercepting the request before the Worker ever runs — consistent with the observed response signature (no `Content-Type`, `Content-Length: 0`, unlike a Worker-generated JSON response) and with Cloudflare's own documented caveat that zone-level rules can and do affect `.well-known/*` paths.

**Proposed fix:**
1. **Human/operator action (no code, no version bump):** Cloudflare Dashboard → the zone covering `ration.mayutic.com` → **Rules** → inspect **Redirect Rules**, **Configuration Rules**, and legacy **Page Rules** for any rule matching `apple-app-site-association` or a broad pattern that could shadow this one path (e.g. a leftover rule from before the Worker route existed); also check **Caching → Cache Rules** for a rule serving a stale cached response on this exact path. Remove or fix whatever is found.
2. Cheap diagnostic checks that can be run without dashboard access first, to narrow the search (already run once with no change in result, should be re-run after any dashboard fix): `curl -si -H "Cache-Control: no-cache" https://ration.mayutic.com/.well-known/apple-app-site-association` and the same URL with a cache-busting query string.
3. Once the origin returns `200` with correct `Content-Type`/body, separately verify Apple's CDN view (`curl -s https://app-site-association.cdn-apple.com/a/v1/ration.mayutic.com`) — a stale/empty result here immediately after the origin fix is expected propagation lag, not a new bug.
4. Physical-device Universal Link tap test with the production entitlement (`applinks:ration.mayutic.com`, no `?mode=developer`). For faster iteration while still debugging the origin (not for final pre-submission verification), a `?mode=developer`-suffixed entitlement on a Developer-Mode device bypasses Apple's CDN — must be removed before final submission.
5. Optional device-side confirmation without a full Universal Link tap: macOS `swcutil dl -d ration.mayutic.com` + `swcutil verify` (per Apple TN3155) to independently confirm Apple's format validation passes.

**Alternative considered and rejected:** Trigger a manual redeploy ("just push again") as the fix, per the audit's original text. Rejected because the evidence in §0 shows the Worker is already correctly deployed and serving the AASA route's sibling paths successfully — a redeploy would not change anything (the bug is not in what's deployed), and treating it as the fix would mean re-discovering this exact bug at the next audit cycle having wasted a deploy cycle on a no-op.

**Guideline/standard mapping:** Universal Links / Associated Domains is required for the app's magic-link auth handoff to function as documented in `plans/app-review-notes.md`; failure here risks App Review Guideline §2.1 (apps that are broken or do not function as expected). OWASP MASVS v2 **MASVS-PLATFORM** deep-link handling controls (MASTG deep-link test area) — the AASA file itself is the platform-level trust anchor for the association, and its correctness is a prerequisite for any deep-link security testing to be meaningful.

**Files touched:** None (application code is already correct). The only repo change in this plan tied to CR-2 is the smoke-test/notifier Worker shipped under H-7 (v1.4.7), which is a detection mechanism, not the fix.

**Test plan:** N/A (no application code change). The "test" is the verification sequence above, run against production.

**Verification step:** `curl -si https://ration.mayutic.com/.well-known/apple-app-site-association` must return `HTTP/2 200`, `content-type: application/json`, and a body with `applinks.details[0].appID == "M2KJH5GDGH.com.mayutic.ration"` and `paths == ["/auth/mobile-callback/open"]`. Then the physical-device tap test per step 4 above.

**Rollback plan:** N/A — this is a dashboard-rule removal, not a code deploy; if removing a rule has an unexpected side effect on another path, re-add the rule via the dashboard's own rule history/audit log (Cloudflare retains rule edit history in most plans) and investigate further before retrying.

**Effort estimate:** S (once dashboard access is available — this is a human action item, not an engineering task; flagged clearly as **not actionable by the coding agent** in this environment; see Open Items below).

**⚠️ Operator action required — this cannot be completed by the coding agent:** Removing/fixing a Cloudflare zone-level Rule requires Cloudflare Dashboard access (Rules tab) or a Zone-scoped API token. The `wrangler` OAuth session available in this environment is Workers/account-scoped only and cannot enumerate or mutate zone Rules. **This is the single highest-priority manual action in this entire plan** — it blocks Universal Links (and therefore the primary, documented magic-link handoff path) regardless of what code ships.

---

### H-1 — `POST /scan` lacks server-side `requireMobileAIConsent`

**Root cause:** [`app/routes/api/mobile/v1.scan.ts`](../app/routes/api/mobile/v1.scan.ts) is missing a call to `requireMobileAIConsent(env, userId)` that the other three AI-submit routes ([`v1.meals.generate.ts:25`](../app/routes/api/mobile/v1.meals.generate.ts), [`v1.meals.import.ts:25`](../app/routes/api/mobile/v1.meals.import.ts), [`v1.manifest.plan-week.ts:26`](../app/routes/api/mobile/v1.manifest.plan-week.ts)) all have, immediately after `requireMobileActiveGroup` and before rate limiting. The gate function itself ([`app/lib/mobile/ai-consent.server.ts:7-20`](../app/lib/mobile/ai-consent.server.ts)) already exists and works correctly — it is simply not wired into this one route, meaning a client that skips or bypasses the iOS UI consent gate (e.g. a modified client, or any future non-iOS client) can trigger AI receipt-scan processing with no server-side consent enforcement.

**Proposed fix:** Add `import { requireMobileAIConsent } from "~/lib/mobile/ai-consent.server";` and insert `await requireMobileAIConsent(context.cloudflare.env, userId);` in `v1.scan.ts`, in the same position (after `requireMobileActiveGroup`, before `checkRateLimit`) as the three sibling routes.

**Alternative considered and rejected:** Enforce consent client-side only, relying on the iOS `AIConsentGateView` (H-8) to prevent unconsented scans from ever reaching the server. Rejected because client-side-only enforcement is not a security control (per this repo's own Zero Trust directive — "every database query must rely on `user_id` from the verified session, never client input" — the same principle applies to consent gating: the server must be the enforcement point, with the client UI as a UX convenience, not a substitute).

**Guideline/standard mapping:** GDPR **Article 6** (lawfulness of processing) and **Article 7** (conditions for consent) — AI processing of user-submitted receipt images is a processing activity requiring a documented, enforced consent basis, not merely a UI affordance. Apple App Review §5.1.1(i)/§5.1.2 (AI/data-processing disclosure consistency).

**Files touched:** `app/routes/api/mobile/v1.scan.ts` (add import + one `await` call).

**Test plan:** Server-side consent-gate logic itself has no unit test today (`app/lib/mobile/__tests__/` has `token.server.test.ts`, `pkce.test.ts`, `hub.server.test.ts`, but no `ai-consent.server.test.ts`). Add **`app/lib/mobile/__tests__/ai-consent.server.test.ts`**: mock `getMobileUser`, assert `requireMobileAIConsent` (a) resolves without throwing when `settings.aiConsentAt` is a non-empty ISO string, (b) throws a 403 with `code: "ai_consent_required"` when `aiConsentAt` is null/undefined, (c) throws the same 403 when `aiConsentAt` is an empty/whitespace string. The `v1.scan.ts` wiring itself is a route-level integration change (D1/KV-dependent), which per repo convention is integration-tier and deferred from the unit-test suite — the unit test above is the regression guard for the underlying gate logic that H-1 depends on.

**Verification step:** With a test user that has no `aiConsentAt` set, `POST /api/mobile/v1/scan` (with a valid auth token but no prior consent) must return `403 ai_consent_required` — reproducing this against a local/dev environment (not production, to avoid burning real scan credits) confirms the fix; re-run after PATCHing `aiConsentAt` to confirm the request now succeeds normally.

**Rollback plan:** Revert the one-line addition; `v1.scan.ts` returns to its prior (consent-unenforced) behavior. No data migration involved.

**Effort estimate:** S

---

### H-8 — AI consent UX/enforcement inconsistent across features

**Root cause:** The actual consent-gate UI is `AIConsentGateView` in [`PrivacySettingsView.swift:84-110`](../ios/Ration/Features/Settings/PrivacySettingsView.swift) (a full-screen sheet with "Not now"/"I agree" + Privacy Policy link) — note this is a different component from `AIFeatureIntroView.swift`, which is the generic credits/cost confirmation screen already shared by all four AI entry points. The consent gate itself is currently wired **only into `ScanView`**: `hasAIConsent`/`checkedConsent` are local `@State` on `ScanView` ([`ScanView.swift:121-123,219-228`](../ios/Ration/Features/Scan/ScanView.swift)), re-derived from `env.api.settings()` on every screen load. `GenerateMealSheet.swift`, `ImportRecipeSheet.swift`, and `PlanWeekSheet.swift` have no equivalent gate — they proceed straight from the shared cost-confirmation intro to the AI action, even though the server already enforces consent on all three (per the audit's B-V6/H-1 cross-reference) — meaning today's inconsistency is "3 client UIs are more permissive-looking than the server actually is," not a server gap on those three.

**Proposed fix:** Per the resolved clarification (one shared gate, shown once across all four entry points):
1. Lift consent state out of `ScanView` into an app-wide-observable store — extend `SessionStore` (which already carries adjacent server state like `credits`/`tier`) with `hasAIConsent: Bool` + a `loadConsent(api:)` method, loaded once at app start alongside the existing session load in `RootView.swift`.
2. Extract a reusable `presentConsentIfNeeded(then:)` coordinator (or a view modifier) that all four sheets (`ScanView`, `GenerateMealSheet`, `ImportRecipeSheet`, `PlanWeekSheet`) call before their existing "proceed" action, instead of each duplicating a local `showingConsentGate`/`hasAIConsent` state machine.
3. Reuse the existing `AIConsentGateView` component as-is (no new UI) from the extracted helper.
4. "Shown once across all four" falls out naturally: `aiConsentAt` is a single server-side field, so the first `onAccept` from *any* entry point PATCHes it once, and the centralized `hasAIConsent` flag immediately reflects `true` for the other three without a second consent prompt or a second network fetch.

**Alternative considered and rejected:** Give generate/import/plan-week a *lighter* inline consent notice (e.g. a one-line disclosure baked into the existing cost-confirmation `AIFeatureIntroView`) instead of the full-screen gate, since the server already enforces consent on those three and the audit itself floated this as an option. Rejected per the resolved clarification: a lighter, inconsistent treatment across entry points is precisely the "inconsistent UX" the audit flagged as the problem (N-2) — presenting a different consent experience depending on which AI feature a user reaches first is confusing and harder to defend to an auditor re-running this exact methodology than one consistent, unambiguous full-screen gate shown exactly once.

**Guideline/standard mapping:** Same as H-1 — GDPR Article 6/7 (consent basis for AI processing), Apple App Review §5.1.1(i)/§5.1.2 (consistent privacy/data-use disclosure across all app surfaces that trigger the same underlying processing).

**Files touched:**
- `ios/Ration/Core/Session/SessionStore.swift` (add `hasAIConsent` + `loadConsent`)
- New: a small coordinator/helper (e.g. `ios/Ration/Core/Consent/AIConsentCoordinator.swift`) implementing `presentConsentIfNeeded(then:)`
- `ios/Ration/Features/Scan/ScanView.swift` (replace local consent state with the shared coordinator call)
- `ios/Ration/Features/Galley/GenerateMealSheet.swift`, `ImportRecipeSheet.swift`, `ios/Ration/Features/Manifest/PlanWeekSheet.swift` (wire in the same coordinator call — exact file names/paths to be confirmed against current tree at implementation time, as sheet locations may have shifted since this research pass)
- `ios/Ration/App/RootView.swift` (trigger the centralized `loadConsent` once at app start, alongside session load)

**Test plan:** New **`ios/RationTests/AIConsentGateSymmetryTests.swift`**: `testConsentStateIsSharedAcrossAllFourEntryPoints()` — once the centralized consent flag lands, assert that setting consent `true` via one code path is visible to the others without a second network fetch (a state-sharing assertion on the shared store, not a full UI test). Run as part of `bun run ios:check`.

**Verification step:** Manual/physical-device walkthrough: as a fresh user with no consent, trigger *any* of the four AI features first (order should not matter) → confirm the full-screen gate appears exactly once → accept → confirm none of the other three features re-prompt for consent on subsequent use in the same session or after app restart (re-derived from the server field, not just in-memory state).

**Rollback plan:** Revert to per-`ScanView`-local consent state (git revert the coordinator/SessionStore changes); the other three sheets simply lose their newly-added gate again, reverting to today's (permissive-looking-but-server-enforced) behavior. No data migration.

**Effort estimate:** M

---

### H-2 — `signOutLocal()` leaves offline snapshots/session/image caches on disk after forced logout

**Root cause:** `AuthManager.signOutLocal()` ([`AuthManager.swift:158-164`](../ios/Ration/Core/Auth/AuthManager.swift)) only clears in-memory/Keychain token state (`accessToken`, `accessExpiry`, `refreshToken` via its `didSet` Keychain delete) and flips `phase = .signedOut`. It does not clear `SnapshotStore` (offline pantry/meal snapshots), `SessionStore`'s in-memory session cache, or `AuthImageLoader`'s cached authenticated images. It is called from three sites — `AuthManager.bootstrap()` (refresh failure at launch), and twice in `APIClient.swift` (401-triggered forced logout) — none of which currently have a reference to `SnapshotStore`/`BillingManager`/`AuthImageLoader` to clear them directly. This creates the audit's documented cross-account leakage scenario: User A is force-signed-out via a 401, their offline snapshots remain on disk in Application Support, and User B signing in on the same shared device can read User A's cached pantry data until an explicit sign-out or org switch happens to clear it.

**Proposed fix (full wipe, per resolved clarification):** Add a `var onSignedOut: (() -> Void)?` hook to `AuthManager`, invoked at the end of `signOutLocal()` (after clearing token state). Wire it once, in `AppEnvironment.init()` (reordering construction so `snapshots`/`billing` exist before `auth`), to run the same full-wipe sequence the explicit sign-out path already uses, plus two net-new pieces:
1. `snapshots.clearAll()` — the exact method explicit sign-out (`SettingsView.swift:144`) and org-switch (`SessionStore.swift:56`) already call. No new snapshot-clearing logic; reuse.
2. `billing.logOut()` — the exact call explicit sign-out already makes (`SettingsView.swift:145`). Reuse.
3. **New:** `AuthImageLoader.clearAll()` — a one-line addition (`cache.removeAll()`) to `AuthImageView.swift`, which currently only has a per-URL `invalidate(url:)`. Addresses the "image cache" half of the audit's C-A9 finding.
4. **New:** `SessionStore.clear()` — a one-line addition (`session = nil`) to `SessionStore.swift`. Addresses the "session cache" half of C-A9. (Org switch doesn't need this today because it immediately re-fetches; forced logout cannot re-fetch, since there's no valid token, so this must be an explicit clear rather than a re-fetch.)
5. **Bundled (M-12, same method, zero extra risk):** add `Keychain.delete(Self.pkceVerifierKey)` inside `signOutLocal()` itself, closing the audit's C-A8/M-12 finding (orphaned PKCE verifier on abandoned magic-link + sign-out) in the same edit.

**Alternative considered and rejected:** Org-scoped wipe only (clear the currently-active org's snapshots, leave other cached orgs on the device untouched), to avoid data loss if the forced 401 was a transient network blip rather than an actual different-user scenario. Rejected per the resolved clarification: a forced 401 logout, by definition, invalidates the current session — anyone signing back in afterward must re-authenticate over the network regardless (login requires connectivity), so the "lost connectivity, got 401'd, lost cached view" UX concern doesn't actually apply (a transient network blip that couldn't reach the server to refresh a token also couldn't reach the server to re-fetch data on next login, so there's no strictly-worse UX being introduced). A full wipe is simpler, matches the already-correct explicit-sign-out behavior exactly, and fully closes the security gap rather than leaving a partial one (a different user on the same device could still read *other-org* cached snapshots under an org-scoped-only wipe if the forced-out user belonged to multiple orgs).

**Guideline/standard mapping:** OWASP MASVS v2 **MASVS-STORAGE-1** (sensitive data is not stored beyond the necessary lifetime; session termination must clear cached sensitive data) and **MASVS-AUTH** (session termination completeness). GDPR **Article 32** (appropriate technical measures ensuring confidentiality — shared-device cross-account leakage is exactly the class of incident Article 32 requires mitigating against).

**Files touched:**
- `ios/Ration/Core/Auth/AuthManager.swift` (`onSignedOut` hook + PKCE verifier delete in `signOutLocal()`)
- `ios/Ration/App/AppEnvironment.swift` (construction reorder + hook wiring)
- `ios/Ration/Core/Design/AuthImageView.swift` (new `AuthImageLoader.clearAll()`)
- `ios/Ration/Core/Session/SessionStore.swift` (new `clear()`)

**Test plan (regression tests required per repo rule — this is a security bug fix):**
- New **`ios/RationTests/AuthManagerSignOutTests.swift`**: `testSignOutLocalClearsPKCEVerifier()`, `testSignOutLocalClearsTokensAndPhase()` (guards the pre-existing partial-clear behavior against future regression), `testSignOutLocalInvokesOnSignedOutHook()` (the seam test guaranteeing the wiring can't silently regress if `AppEnvironment` is refactored).
- New **`ios/RationTests/AppEnvironmentForcedLogoutWipeTests.swift`** — the direct regression test for the cross-account leakage scenario: `testForcedLogoutClearsSnapshotsForActiveOrg()` (seed a snapshot, force-logout, assert it's gone), `testForcedLogoutClearsSessionCache()`, `testForcedLogoutClearsImageCache()`.
- Both new test files follow this codebase's existing convention (real instances, no mocks, per-test-unique identifiers, explicit cleanup, `async` test methods).

**Verification step:** On a physical device or simulator: sign in, populate cargo/meal snapshots, force a 401 (e.g. revoke the refresh token server-side or simulate via a debug hook), confirm the app signs out; then inspect Application Support (`ration-snapshots/`) directly (or via a debug-build introspection) to confirm no snapshot files remain for the previously-active org; confirm `SessionStore.session` is `nil` and no authenticated images render from cache before the next sign-in completes.

**Rollback plan:** Remove the `onSignedOut` hook wiring in `AppEnvironment` (revert to a no-op `onSignedOut`); `signOutLocal()` reverts to today's partial-clear behavior. The two new no-op-safe methods (`clearAll()`, `clear()`) can remain dormant/unused with no behavioral effect if rolled back this way — low-risk revert.

**Effort estimate:** M

---

### H-3 — `GET /hub` unbounded parallel fan-out, no rate limit

**Root cause:** [`app/routes/api/mobile/v1.hub.ts:6-21`](../app/routes/api/mobile/v1.hub.ts) has no `checkRateLimit` call at all (contrast with [`v1.meals.match.ts:17-21`](../app/routes/api/mobile/v1.meals.match.ts), which does). The loader fans out via `Promise.all` across 10 operations in [`app/lib/mobile/hub.server.ts:65-123`](../app/lib/mobile/hub.server.ts). Investigation found the **3× `matchMeals` calls are already correctly bounded** (each passes `preLimit: MOBILE_PRE_LIMIT = 12` and a clamped widget limit) — no fix needed there; that pattern is in fact the exact template H-5 needs to replicate. The genuinely unbounded piece is the **full supply-item fetch** feeding the hub's supply widget: `hub.server.ts:85` → `getSupplyList` → ... → [`supply.server.ts:407`](../app/lib/supply.server.ts), a `select` with no `.limit()`, run on every `/hub` call. This fetch is currently *intentionally* full — [`hub.server.test.ts:48-49`](../app/lib/mobile/__tests__/hub.server.test.ts) proves `itemCount`/`uncheckedCount`/`purchasedCount` are computed over the complete list before `displayItems` is sliced to 20 for rendering. A naive `.limit()` on the row fetch would silently break these counts.

**Proposed fix:**
1. Add a new `hub_read` rate-limit tier (60/min per userId, matching the existing `status_poll`/`cargo_list`/`meal_list` tiers at [`rate-limiter.server.ts:279-288,310-314`](../app/lib/rate-limiter.server.ts)) and call `checkRateLimit` in `v1.hub.ts`'s loader before `getMobileHubData`, following the exact pattern in `v1.meals.match.ts:17-27`.
2. Bound the supply-item row fetch **without breaking the count semantics**: split into a bounded fetch for `displayItems` (reusing H-4's new `{limit, offset}` option on `getSupplyListById`, capped at 20) plus a separate lightweight count query (e.g. a new `getSupplyItemStats` helper doing a `COUNT`-style aggregate instead of fetching full rows) for `itemCount`/`uncheckedCount`/`purchasedCount`. This is a real, non-trivial change (not a one-line `.limit()`) — called out explicitly so the implementing engineer doesn't underestimate it.

**Alternative considered and rejected:** Add `.limit(20)` directly to the `supply.server.ts:407` query with no separate count query. Rejected because this would silently regress the existing hub-widget count display (confirmed by the existing test at `hub.server.test.ts:48-49`, which would need to be *changed* to accept wrong/approximate counts rather than *extended* to verify correct ones) — trading a real correctness bug for a performance fix is not an acceptable trade, especially since the count-preserving fix is not meaningfully harder.

**Guideline/standard mapping:** Not an Apple/GDPR concern directly — this is a scale/availability finding. OWASP MASVS v2 **MASVS-RESILIENCE** (the app/backend implements mechanisms to detect and mitigate resource-exhaustion abuse) and GDPR **Article 32**'s availability limb (appropriate measures ensuring ongoing availability of processing systems).

**Files touched:** `app/routes/api/mobile/v1.hub.ts`, `app/lib/rate-limiter.server.ts` (new tier), `app/lib/mobile/hub.server.ts`, `app/lib/supply.server.ts` (new stats helper + reuse of H-4's limit option).

**Test plan:** Extend `app/lib/mobile/__tests__/hub.server.test.ts` to assert counts remain correct after the split fetch/count-query change. New `app/lib/__tests__/rate-limiter-hub-read.test.ts` (per the one-file-per-tier convention seen in `rate-limiter-fin-billing-write.test.ts`) asserting the tier config and 429-on-61st-call behavior. New `app/routes/api/mobile/__tests__/v1.hub.test.ts` asserting `checkRateLimit` is invoked with `hub_read` before `getMobileHubData` and that a blocked result returns 429 + `Retry-After`.

**Verification step:** Load-test or manually script 61 rapid `/hub` calls as one user in a dev/local environment and confirm the 61st returns `429` with a `Retry-After` header; separately confirm hub widget counts match a hand-computed total against a seeded supply list larger than the 20-item display slice.

**Rollback plan:** Revert the rate-limit tier addition and the fetch/count-query split; `v1.hub.ts` returns to today's unbounded, unrated behavior. No data migration.

**Effort estimate:** M

---

### H-4 — `GET /supply` unbounded item fetch, no pagination

**Root cause:** [`app/routes/api/mobile/v1.supply.ts:6-14`](../app/routes/api/mobile/v1.supply.ts) calls `getSupplyList(db, organizationId)` with no limit/offset and no rate limit, hitting the same unbounded `supply.server.ts:407` query as H-3.

**Proposed fix:** Add an `options?: { limit?: number; offset?: number }` parameter to `getSupplyListById`/`ensureSupplyList`/`getSupplyList`, applied via Drizzle's `.$dynamic()` + conditional `.limit()`/`.offset()` — the **exact same shape already implemented twice** in this codebase for `getCargo()` ([`cargo.server.ts:88-116`](../app/lib/cargo.server.ts)) and `getMeals()` ([`meals.server.ts:99-140`](../app/lib/meals.server.ts)). Default the new parameter to "no limit" (i.e. today's behavior) so H-3's hub-widget dependency on full-list counts is not silently broken by this change alone — H-3 opts in explicitly to the bounded path once its count-query split lands. In `v1.supply.ts`, parse optional `limit`/`offset` query params (default limit **200**, matching the `d1-query-safety.mdc` guidance for cargo-adjacent-volume endpoints) and add a new `supply_read` rate-limit tier (60/min per userId, same class as `cargo_list`).

**Alternative considered and rejected:** Build a new generic pagination/limit utility shared across H-3/H-4/H-5 (as the planning prompt's own framing initially suggested might make sense for the "unbounded-read theme"). Rejected after investigation: the three fixes need genuinely different defaults driven by different data shapes (meal `preLimit` of 12 for recipe-ingredient matching vs. ~200 for flat supply rows), and the existing `{limit, offset}` options-object pattern is already proven twice in this codebase with ~5 lines of `.$dynamic()` boilerplate per call site — a generic wrapper would add an abstraction layer over Drizzle's query builder without saving meaningful code, and a single shared numeric constant would be semantically wrong for at least one of the three fixes.

**Guideline/standard mapping:** Same as H-3 — MASVS-RESILIENCE, GDPR Article 32 (availability).

**Files touched:** `app/lib/supply.server.ts`, `app/routes/api/mobile/v1.supply.ts`, `app/lib/rate-limiter.server.ts` (new `supply_read` tier).

**Test plan:** New `app/lib/__tests__/supply-pagination.test.ts` — unit tests for the new `{limit, offset}` option: default (no options) returns all items unchanged; `limit` caps count; `offset` skips correctly; both combine correctly across a synthetic multi-page item set. New `app/lib/__tests__/rate-limiter-supply-read.test.ts` (same convention as H-3's tier test). New `app/routes/api/mobile/__tests__/v1.supply.test.ts` asserting rate-limit enforcement and correct `limit`/`offset` query-param parsing/pass-through.

**Verification step:** Seed a supply list with >200 items in a dev/local environment; confirm `GET /supply` returns exactly 200 by default, and that `?limit=50&offset=200` returns the next page correctly (no duplicate/missing items across pages when concatenated).

**Rollback plan:** Revert the `options` parameter and rate-limit tier; `getSupplyListById`'s default (no-options) behavior is unchanged either way, so this is a low-risk, purely additive rollback.

**Effort estimate:** S

---

### H-5 — `GET /meals/match` loads full org meal catalog, no `preLimit`

**Root cause:** [`app/routes/api/mobile/v1.meals.match.ts:43-51`](../app/routes/api/mobile/v1.meals.match.ts) builds a `MealMatchQuery` that sets `mode`, `minMatch`, `limit`, `tags`, `servings`, `type`, `domain` — but never sets `preLimit`. In [`app/lib/matching.server.ts:325-341,410`](../app/lib/matching.server.ts), `preLimit` has no default, so the bounding check (`if (preLimit != null && preLimit > 0)`) is skipped and the underlying meal query at `matching.server.ts:384-408` runs with no `.limit()` — the full org meal catalog is loaded and scored on every call, which is fine at free-tier caps but a Worker CPU-timeout risk at Crew Member (unlimited-inventory) scale.

**Proposed fix:** Add `preLimit` to the query object built in `v1.meals.match.ts`, matching the already-proven hub-widget template (`hub.server.ts:96,105,114`, `MOBILE_PRE_LIMIT = 12`). Export `MOBILE_PRE_LIMIT` from `hub.server.ts` (or relocate it to `query-utils.server.ts` alongside the `D1_MAX_*` constants) and import it here, so the two "meal preLimit" call sites can't drift independently. **Important cross-check, not a copy-paste:** confirm this value against `/meals/match`'s own `limit` schema cap in `MealMatchQuerySchema` — if that schema allows a `limit` higher than 12, `preLimit` must be raised accordingly (e.g. `Math.max(12, parsed.data.limit ?? 20)`) or results will be truncated before matching even runs, which would be a correctness regression, not just a performance fix.

**Alternative considered and rejected:** Leave `/meals/match` unbounded but add a rate limit as the sole mitigation. Rejected: `/meals/match` already has a `meal_match` rate-limit tier (20/min per userId, `rate-limiter.server.ts:104-108`) — the finding isn't a missing rate limit, it's a missing per-request bound, and 20 unbounded full-catalog scans per minute per user is still a real cost/latency risk at Crew Member scale even with the existing rate limit in place.

**Guideline/standard mapping:** Same as H-3/H-4 — MASVS-RESILIENCE, GDPR Article 32 (availability).

**Files touched:** `app/routes/api/mobile/v1.meals.match.ts`, `app/lib/mobile/hub.server.ts` (export the shared constant).

**Test plan:** New `app/routes/api/mobile/__tests__/v1.meals.match.test.ts` — the regression test for this exact bug: mock `matchMeals`, assert the call args include a `preLimit` field with a value `>=` the effective query `limit` (per repo rule: bug fixes need a regression test that would have caught the original bug). No change needed to `matching.server.ts` itself or its existing test (`matching-server.test.ts:39` already covers `preLimit: 12` usage correctly).

**Verification step:** Seed an org with a meal catalog larger than `preLimit`, confirm `/meals/match` response time/row-scan behavior (via D1 query log or a timing assertion in the new test) reflects the bounded pre-filter rather than a full-catalog scan, while match-quality results remain equivalent to before for catalogs smaller than `preLimit` (no regression for typical free-tier orgs).

**Rollback plan:** Remove the `preLimit` field from the query object; behavior reverts to today's unbounded scan. Zero data/migration impact — purely a query-shape change.

**Effort estimate:** S

---

### H-6 — Orphaned `scan-pending/*` R2 objects, no lifecycle rule

**Root cause:** Failed/abandoned scans leave orphaned objects under `scan-pending/*` in the `ration-storage` R2 bucket with no automatic cleanup. The existing daily cron (`0 3 * * *`, [`wrangler.jsonc:169-170`](../wrangler.jsonc)) handles session/queue-job/agent-kitchen purges but — confirmed by reading its handler in `workers/app.ts` — **does not touch R2 at all today**. This is unbounded storage-cost growth over time, not a one-time issue with an existing fix to extend.

**Proposed fix:** Add a native R2 Object Lifecycle Rule, scoped by prefix, expiring `scan-pending/*` objects after 24h:
```bash
npx wrangler r2 bucket lifecycle add ration-storage \
  --prefix "scan-pending/" \
  --expire-days 1 \
  --id "expire-scan-pending-orphans"
```
This is a **declarative, bucket-level configuration with zero application code** — no `wrangler.jsonc` change, no Worker code change. Apply the same rule to the `ration-storage-dev` bucket for dev/prod parity (optional but recommended).

**Alternative considered and rejected (per resolved clarification):** Extend the existing daily cron job to also scan for and delete orphaned `scan-pending/*` objects older than 24h. Rejected: this would require the cron handler to `list()` the R2 bucket (paginated, since R2 `list()` caps at 1000 keys per call) and issue delete calls for every matching key, every day, for a bucket that could grow large — genuinely more code, more D1/R2 API calls, and more edge cases (partial failures mid-list, pagination bugs) than a rule Cloudflare's platform already enforces natively and for free. The lifecycle rule approach has no code to maintain and no failure mode beyond "did I set the right prefix/threshold," which is trivially verifiable once.

**Guideline/standard mapping:** GDPR **Article 5(1)(e)** (storage limitation — data must not be kept longer than necessary for its purpose) and **Article 17** (right to erasure — orphaned receipt images are exactly the kind of leftover personal data that shouldn't persist indefinitely with no purpose). OWASP MASVS v2 **MASVS-STORAGE** (server-side data retention discipline, by extension of the same storage-hygiene principle applied client-side elsewhere in this app).

**Files touched:** None (bucket-level config only). README's infrastructure section should document the rule's existence (see §Version-bump plan below — this rides along with the H-7 release's README update rather than triggering its own).

**Test plan:** N/A — no application code. Verification is operational (see below).

**Verification step:** `npx wrangler r2 bucket lifecycle list ration-storage` confirms the rule is active with the correct prefix/threshold; upload a test object under `scan-pending/test-lifecycle-check.jpg`, and confirm (after the 24-48h window Cloudflare documents for lifecycle rule execution — note this is not instantaneous) that it's removed without manual intervention. For faster verification, temporarily add a rule with a much shorter expiry (e.g. 1 day is already the minimum granularity Cloudflare supports for R2 lifecycle rules) against a disposable test prefix, or trust the dashboard's rule-preview/dry-run if available.

**Rollback plan:** `npx wrangler r2 bucket lifecycle remove ration-storage --id "expire-scan-pending-orphans"`. Zero code to revert.

**Effort estimate:** S

---

### H-7 — No production observability beyond console logs; deploy-pipeline visibility gap

**Root cause:** Structured logging exists (`app/lib/logging.server.ts`, `console.info/warn/error/critical` with PII-safe `redactId()`/`redactEmail()` helpers) but nothing captures, aggregates, or alerts on it in production — no Sentry, Logpush, Analytics Engine, or custom metrics are configured. Separately (and, per §0's corrected root-cause analysis, **not** the actual cause of CR-2, but a real gap regardless): Cloudflare Workers Builds auto-deploys on every push to `main` with **no notification on build failure or rollback** — a genuine future risk even though it did not cause this particular incident.

**Proposed fix (Cloudflare-native, per resolved clarification — no Sentry, no new secret):**
1. Add an `analytics_engine_datasets` binding to `wrangler.jsonc` (`{ binding: "ANALYTICS", dataset: "ration_events" }`) — datasets auto-create on first `writeDataPoint()` call, no manual provisioning, no runtime credential (account-scoped binding, same trust model as the existing KV/D1/Vectorize bindings).
2. Build one small, standalone **consumer Worker** (e.g. `workers/build-notifier.ts` + its own minimal `wrangler.jsonc`/config, committed inside this repo) subscribed to Cloudflare Workers Builds' native **Event Subscriptions** feature (publishes `build.started`/`build.succeeded`/`build.failed` events to a Cloudflare Queue). This one Worker does two jobs from two event types:
   - On `build.failed` (any branch): email an ops address via the **existing `EMAIL` `send_email` binding** already declared in `wrangler.jsonc` (sender `noreply@mayutic.com`, already used for magic-link auth) — **zero new secrets, zero new vendor**, unlike Cloudflare's own Slack/Discord notification template which needs a webhook URL + API token.
   - On `build.succeeded` where `buildTriggerMetadata.branch === "main"`: run the **post-deploy smoke test** — `fetch()` against `https://ration.mayutic.com/.well-known/apple-app-site-association` (expect `200` + `application/json`) and `https://ration.mayutic.com/.well-known/api-catalog` (expect `200`, confirms the Worker itself is live independent of any single-path zone-rule risk). On failure of either: email via `EMAIL`, and write a fail data point to `ANALYTICS`. On success: optionally write a pass data point for trend visibility.
3. Treat Logpush (request/exception archival via a Logpush job to an R2 destination) as an explicit **fast-follow**, not part of this pass — it adds long-retention searchability but is not itself a notification mechanism, and doesn't require any code (just a dashboard/API job config once there's a concrete search need). Add the one-line `"logpush": true` flag to `wrangler.jsonc` now (bump-worthy but trivial) so the Logpush *job* can be configured later purely operationally, with no further code deploy needed at that point.

**Alternative considered and rejected:** Sentry (per the resolved clarification against a Cloudflare-native approach) and, separately, a GitLab-CI-triggered smoke test. Sentry rejected because it introduces a new third-party vendor + DSN + `wrangler secret put` for zero net-new capability beyond what Analytics Engine + Logpush + email already cover for this app's scale, contradicting the repo's default preference to minimize new secrets/vendors absent a specific need. GitLab-CI-triggered smoke test rejected because `.gitlab-ci.yml`'s deploy stage is explicitly commented out and Cloudflare Workers Builds (not GitLab CI) is the actual deploy trigger — there is no reliable "deploy just finished" signal available inside GitLab CI to hook a post-deploy job onto; Cloudflare Workers Builds only publishes completion events via its own Event Subscriptions mechanism. A polling-based scheduled cron smoke test (every 15-30 min) was also considered as a complement, not a replacement — it doesn't satisfy "run after every deploy specifically" (a regression could sit undetected for up to the polling interval) but is worth adding later as a steady-state drift safety net; not required for this pass. Cloudflare Health Checks (Load Balancer feature) were ruled out entirely — they require a Load Balancer with origin pools, which this single-Worker-behind-one-custom-domain architecture doesn't have and shouldn't provision just for this.

**Guideline/standard mapping:** GDPR **Article 33** (breach notification within 72 hours presupposes the operator can actually detect an incident — this observability gap is a precondition failure for Article 33 compliance, not just an operational nice-to-have). No direct Apple guideline (this is backend-only), though reliable production behavior underpins the same §2.1 "apps that are broken... will be rejected" concern raised for CR-2.

**Files touched:** `wrangler.jsonc` (new `analytics_engine_datasets` binding + `"logpush": true` flag), new `workers/build-notifier.ts` (+ its own minimal Wrangler config, or a dedicated `wrangler.build-notifier.jsonc` if it needs isolated bindings), existing queue-consumer catch blocks (add `ANALYTICS.writeDataPoint()` calls at failure sites, confirmed safe — see PII check below), `app/routes/api/checkout.tsx:221-224` (optional drive-by: wrap two currently-unredacted IDs in the existing `redactId()` helper for consistency before this log surface gets a wider audience via Logpush/Analytics Engine).

**Test plan:** This pass is mostly configuration + a new small Worker; no `app/lib/` pure function of significant complexity is introduced. If the smoke-test pass/fail evaluation logic in `build-notifier.ts` grows beyond a trivial `fetch().ok` check (e.g. JSON-body assertions), extract it into a small pure function and add a co-located unit test per repo convention (e.g. `workers/__tests__/build-notifier-checks.test.ts`). No existing test needs modification.

**Verification step:** Confirm `ANALYTICS` binding via `wrangler types` picking it up with no errors; trigger a deliberate test build failure (e.g. a throwaway branch with a syntax error, pushed and then reverted) and confirm the ops inbox receives a failure email within a few minutes; confirm a normal successful deploy to `main` triggers the smoke test and (assuming CR-2 is fixed by then) results in a pass with no email, or (if CR-2 is not yet fixed) results in exactly the AASA failure email this mechanism is designed to produce.

**Rollback plan:** Remove the `analytics_engine_datasets` binding and the `build-notifier.ts` Worker/Event Subscription; existing logging (`console.*`) is unaffected either way — this is purely additive instrumentation with no read/write path in the main application that depends on it.

**Effort estimate:** M

---

## 4. Cross-cutting decisions log

| Decision | Resolution | Rationale |
|---|---|---|
| Observability vendor | Cloudflare-native (Analytics Engine primary this pass; Logpush flagged now, configured later) | Zero new secrets/vendors; sufficient for current scale; consistent with repo's Cloudflare-first posture |
| R2 cleanup mechanism | Native R2 Object Lifecycle Rule | Zero code, zero maintenance, prefix-scoped, no new failure modes vs. extending cron |
| Forced-logout wipe scope | Full wipe (same as explicit sign-out) | Fully closes the cross-account leakage gap in one mechanism; re-fetch cost is negligible since login itself requires connectivity |
| Deploy-flakiness scope | Detection/alerting only — **and this is now moot as originally framed**, since live evidence shows deploys are not actually flaky; the notifier Worker is future-proofing, not a fix for an active problem | Evidence-driven correction — building a "fix" for a problem that isn't actually occurring would be wasted, possibly misleading effort |
| Demo account for App Review | Create a monitored inbox + document the process (zero code) | Simplest path given magic-link-only auth has no password fallback for a reviewer; no engineering effort justified without evidence App Review's monitored-inbox approach has failed before |
| AI consent UX symmetry | One shared full-screen gate, shown once across all 4 entry points | Consistent UX is more defensible to a re-auditor than a per-feature-tuned mix of full-screen/inline treatments; falls out cheaply once consent state is centralized (single server field already) |
| H-3/H-4/H-5 shared utility | No new generic utility — reuse existing `preLimit` and `{limit, offset}` patterns verbatim | Investigation found the existing patterns are already proven twice each in this codebase; a new abstraction would add indirection without saving meaningful code, and the three fixes need genuinely different default values |
| CR-2 root cause | **Corrected from the audit**: not a silent deploy rollback (refuted with deploy-history + sibling-route evidence); most likely a Cloudflare zone-level Rule specific to this one path | Direct evidence gathered in this planning pass (§0) supersedes the audit's original hypothesis — flagged per the planning prompt's own instruction to note any finding that has changed state |
| M-9 (composite index), B-R4/M-4 (adjacent rate limits), N-3/L-6 (consent copy) | Explicitly out of scope for this plan; tracked as separate Medium/Low fast-follows | Per the planning prompt's instruction not to silently bundle Medium/Low work into High/Critical fixes |

---

## 5. Consolidated version-bump plan

**Policy: one version bump per coordinated deliverable/PR, not per individual finding.** Findings that must land together (per the dependency graph in §2) share one bump; independent findings each get their own. Current version at the start of this plan: **1.4.5**.

| Version | Contents | Findings closed |
|---|---|---|
| **v1.4.6** | Privacy manifest (`PrivacyInfo.xcprivacy` + `project.yml` override) | CR-1 |
| **v1.4.7** | Analytics Engine binding + instrumentation, build-notifier Worker (deploy-failure email + post-deploy smoke test), `logpush: true` flag. R2 lifecycle rule and the CR-2 zone-Rule fix are documented alongside this release but are zero-code operator actions, not separately versioned. | H-6 (documented), H-7 (code); CR-2's verification tooling (not its root-cause fix, which has no code) |
| **v1.4.8** | Server consent gate on `/scan` (H-1) + centralized/symmetric client consent gate across all 4 AI entry points (H-8) | H-1, H-8 |
| **v1.4.9** | Forced-logout full wipe (snapshots/session/image cache) + PKCE verifier cleanup (M-12, bundled) | H-2 (+ M-12) |
| **v1.4.10** | Hub rate limit + supply-count-safe bounding (H-3), supply pagination + rate limit (H-4), meals-match `preLimit` (H-5) | H-3, H-4, H-5 |

Each bump: sync `APP_VERSION`/`MCP_SERVER_VERSION` in `app/lib/version.ts` with `package.json`, include `[v1.4.X]` in the commit message, per `.cursor/rules/ration-master.mdc`. All five stay within the `1.4.x` patch range (currently at `.5`, ceiling is `.49` before rolling to `1.5.0`) — no minor bump is triggered by this plan alone.

**Explicitly not versioned:** the CR-2 Cloudflare-dashboard Rule fix itself (no code); the H-6 R2 lifecycle rule command itself (no code); the demo-account operational setup (no code). These are documented in README/runbook updates riding along with the nearest code release, per Track D's recommendation, rather than each claiming an independent version number that would misleadingly suggest a code change occurred.

---

## 6. Post-plan Definition of Done checklist

Mapped literally to this plan's outputs, restating `.cursor/rules/ration-master.mdc`'s Definition of Done:

- [ ] `bun run test:unit` passes, including all new tests listed per finding above (ai-consent gate, supply pagination, rate-limit tiers ×2, meals-match preLimit regression)
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run ios:check` passes, including all new XCTest files (`AuthManagerSignOutTests`, `AppEnvironmentForcedLogoutWipeTests`, `AIConsentGateSymmetryTests`)
- [ ] Each of v1.4.6–v1.4.10 lands as its own commit with `app/lib/version.ts` + `package.json` synced and `[vX.Y.Z]` in the commit message
- [ ] README updated: infrastructure/bindings reference (§1, `analytics_engine_datasets` + `logpush`), rate-limiting matrix (§9.2, new `hub_read`/`supply_read` tiers), security architecture (§7, consent-gate symmetry + forced-logout wipe behavior), Cloudflare Workers Builds section (§13, note the new build-notifier Worker + Event Subscription), and a new short note on R2 lifecycle rules for `scan-pending/*` — verified against the actual diff at implementation time, not assumed from this plan alone
- [ ] `plans/app-review-notes.md` updated: demo-account inbox documented, Universal Links checklist re-verified against the fixed AASA response
- [ ] CR-2's Cloudflare dashboard Rules audit completed and confirmed via production `curl` (this is the one item in this plan that is a hard blocker on human/operator action outside the coding agent's available tooling — flagged prominently, not buried)
- [ ] Physical-device Universal Link tap test completed post-CR-2-fix
- [ ] Apple Privacy Report generated and inspected (CR-1) with no undeclared-API warnings
- [ ] App Store Connect App Privacy questionnaire cross-checked against the shipped manifest
- [ ] M-9, B-R4/M-4, N-3/L-6 opened as separate fast-follow backlog items (not silently closed by this plan)

---

*This plan folds in and closes out four parallel research briefs (`plans/.scratch/track-{a,b,c,d}-findings.md`), which are deleted after synthesis per the planning prompt's instruction not to leave loose scratch artifacts in the repo.*
