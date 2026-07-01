# iOS Security & App Store Audit — June 2026

**Date:** 2026-06-30  
**Scope:** Ration iOS native client (`ios/Ration/`), mobile API surface (`/api/mobile/v1/*`), auth handoff infrastructure, App Store Review compliance, scale readiness for iOS download growth  
**Version audited:** 1.4.5 (`app/lib/version.ts`)  
**Methodology:** OWASP MASVS v2 (L1 baseline + selected L2/P controls), Apple App Review Guidelines (§2 Performance, §3 Business, §5 Legal/Privacy), Apple Privacy Manifest / Required-Reason API requirements (enforced since May 2024), Cloudflare Workers scaling characteristics  
**Auditors:** Static code analysis + live verification (see §0)

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 2 | **Open** — App Store blockers |
| High | 8 | **Open** — fix before or immediately after submission |
| Medium | 14 | Documented / backlog |
| Low | 10 | Documented / backlog |
| Info | 12 | Positive controls (preserved) |

### App Store submission verdict

**Fail — not ready for submission today.**

Two blocking items must be resolved before App Store Connect upload:

1. **Missing first-party `PrivacyInfo.xcprivacy`** — no privacy manifest exists in the app target (confirmed absent repo-wide). Apple rejects submissions with undeclared Required-Reason API usage (`ITMS-91053` / `ITMS-91055`).
2. **Production AASA returns HTTP 404** — `https://ration.mayutic.com/.well-known/apple-app-site-association` returned `404` on 2026-06-30 despite the route being implemented in code. Universal Links for magic-link auth will not work in production until deployed.

After resolving blockers, posture is **Pass-with-conditions** — security architecture is sound (PKCE, Keychain, server-side credit ledger, org-scoped JWT), but several High findings should be remediated in the first post-submission patch.

### Top 5 risks

| # | Risk | Severity |
|---|------|----------|
| 1 | No app privacy manifest → App Store rejection | Critical |
| 2 | AASA not live in production → Universal Links broken | Critical |
| 3 | `/scan` lacks server-side AI consent gate (UI-only) | High |
| 4 | Forced logout (`signOutLocal`) leaves offline snapshots on disk | High |
| 5 | Unbounded hub/supply/meal-match reads will degrade at Crew Member scale | High (scale) |

### Scale verdict

Infrastructure (Cloudflare Workers + D1 + Queues + credit ledger) is **reasonable for ~10K active iOS users**. Growth toward **100K–1M** requires hardening unbounded read paths, R2 lifecycle for scan uploads, production observability, and stronger AI spend guardrails — especially for Crew Member orgs with unlimited inventory.

---

## 0. Live verification (2026-06-30)

| Check | Result |
|-------|--------|
| `bun run test:unit` | **Pass** — 131 files, 1199 tests |
| `bun run typecheck` | **Pass** |
| `bun run lint` | **Pass** — 718 files, no issues |
| `bun run ios:check` | **Pass** — generate + build + 58 XCTest cases |
| Production AASA | **Fail** — `curl -si https://ration.mayutic.com/.well-known/apple-app-site-association` → `HTTP/2 404` |
| Production `.well-known/api-catalog` | **Pass** — `HTTP/2 200` (confirms Worker is live; AASA route likely undeployed) |
| App-target `PrivacyInfo.xcprivacy` | **Absent** — 0 files in `ios/` |
| RevenueCat SDK privacy manifest | **Present** — bundled at build time in `RevenueCat_RevenueCat.bundle/PrivacyInfo.xcprivacy` (DerivedData) |

---

## 1. iOS client security (MASVS-mapped)

### 1.1 Networking (MASVS-NETWORK)

| ID | Finding | Severity | Status | Reference |
|----|---------|----------|--------|-----------|
| C-N1 | Production API base is hardcoded HTTPS; ephemeral `URLSession` with no HTTP cache | Info | Verified | [`AppConfig.swift:11`](../ios/Ration/Core/Networking/AppConfig.swift), [`APIClient.swift:13-16`](../ios/Ration/Core/Networking/APIClient.swift) |
| C-N2 | Bearer token attached per request; single 401 retry with single-flight refresh | Info | Verified | [`APIClient.swift:101-127`](../ios/Ration/Core/Networking/APIClient.swift), [`AuthManager.swift:127-143`](../ios/Ration/Core/Auth/AuthManager.swift) |
| C-N3 | GET-only retry on 429/503 with clamped `Retry-After` (0.5–60s) | Info | Verified | [`APIClient.swift:130-141`](../ios/Ration/Core/Networking/APIClient.swift) |
| C-N4 | Avatar URL resolver allowlists `/api/*` relative paths and OAuth hosts; rejects `javascript:`, `file:`, `data:` | Info | Verified | [`AvatarURLResolver.swift`](../ios/Ration/Core/Networking/AvatarURLResolver.swift) |
| C-N5 | No `print`/`NSLog`/`os_log`/`debugPrint` anywhere in `ios/Ration/` | Info | Verified | Repo-wide grep |
| C-N6 | No TLS certificate pinning (relies on system ATS) | Low | Accepted | MASVS-NETWORK-2 is L2/optional; acceptable for v1 |
| C-N7 | `RATION_API_BASE` env override accepts any URL including non-HTTPS | Low | Dev-only risk | [`AppConfig.swift:7-10`](../ios/Ration/Core/Networking/AppConfig.swift) |
| C-N8 | No custom request/resource timeouts (URLSession defaults ~60s) | Low | Backlog | [`APIClient.swift:11-16`](../ios/Ration/Core/Networking/APIClient.swift) |
| C-N9 | 401 retry replays original POST/multipart body once — non-idempotent endpoints (scan upload, batch cargo) could double-submit | Medium | Open | [`APIClient.swift:116-127`](../ios/Ration/Core/Networking/APIClient.swift) |
| C-N10 | Transport errors surface `error.localizedDescription` to UI | Low | Open | [`APIClient.swift:109`](../ios/Ration/Core/Networking/APIClient.swift), [`APIError.swift:24-25`](../ios/Ration/Core/Networking/APIError.swift) |
| C-N11 | Decoding errors embed full Swift `DecodingError` string — may include response JSON fragments | Medium | Open | [`APIClient.swift:160`](../ios/Ration/Core/Networking/APIClient.swift), [`AuthManager.swift:184`](../ios/Ration/Core/Auth/AuthManager.swift) |
| C-N12 | `AuthImageLoader` uses `URLSession.shared` (default disk cache) for authenticated org logos | Medium | Open | [`AuthImageView.swift`](../ios/Ration/Core/Design/AuthImageView.swift) — authenticated responses may persist in system `URLCache` |
| C-N13 | Hardcoded client version header `X-Ration-Client: ios/1.0.0` drift from app version 1.4.5 | Low | Open | [`APIClient.swift:95`](../ios/Ration/Core/Networking/APIClient.swift) |

### 1.2 Authentication & session (MASVS-AUTH)

| ID | Finding | Severity | Status | Reference |
|----|---------|----------|--------|-----------|
| C-A1 | PKCE with S256 challenge; verifier from `SecRandomCopyBytes` (32 bytes) | Info | Verified | [`PKCE.swift:13-25`](../ios/Ration/Core/Auth/PKCE.swift) |
| C-A2 | Refresh token in Keychain; access token memory-only | Info | Verified | [`AuthManager.swift:22-31`](../ios/Ration/Core/Auth/AuthManager.swift) |
| C-A3 | Keychain accessibility: `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`; no iCloud sync | Info | Verified | [`Keychain.swift:5-6,21`](../ios/Ration/Core/Auth/Keychain.swift) |
| C-A4 | Single-flight refresh — concurrent callers coalesce | Info | Verified | [`AuthManager.swift:127-143`](../ios/Ration/Core/Auth/AuthManager.swift) |
| C-A5 | Proactive refresh when access token within 60s of expiry | Info | Verified | [`AuthManager.swift:119-124`](../ios/Ration/Core/Auth/AuthManager.swift) |
| C-A6 | Deep-link code parsing restricted by host/path/scheme | Info | Verified | [`RationApp.swift`](../ios/Ration/App/RationApp.swift) |
| C-A7 | PKCE verifier stored in Keychain during magic-link flow; deleted on successful exchange | Info | Verified | [`AuthManager.swift:64-65,93`](../ios/Ration/Core/Auth/AuthManager.swift) |
| C-A8 | **`signOutLocal()` does not delete PKCE verifier** — orphaned if user abandons magic-link then signs out | Low | Open | [`AuthManager.swift:158-164`](../ios/Ration/Core/Auth/AuthManager.swift) |
| C-A9 | **`signOutLocal()` clears refresh token from Keychain** (via `didSet`) but does not wipe snapshots, session cache, or image cache | High | Open | [`AuthManager.swift:158-164`](../ios/Ration/Core/Auth/AuthManager.swift), [`APIClient.swift:121,147`](../ios/Ration/Core/Networking/APIClient.swift) |
| C-A10 | Explicit sign-out path correctly clears snapshots + RevenueCat + Keychain | Info | Verified | [`SettingsView.swift:142-148`](../ios/Ration/Features/Settings/SettingsView.swift) |
| C-A11 | `SecItemAdd`/`SecItemDelete` return codes ignored — silent persistence failure possible | Low | Open | [`Keychain.swift:17-22,47`](../ios/Ration/Core/Auth/Keychain.swift) |
| C-A12 | Custom URL scheme `ration://` registered — hijack mitigated by PKCE but remains audit surface | Low | Accepted | [`Info.plist:39-50`](../ios/Ration/App/Info.plist) |

**Cross-account leakage scenario:** User A is force-signed-out via 401 (`signOutLocal`). Offline snapshots for User A's org remain in Application Support. User B signs in on the same device. Until User B triggers an org switch or explicit sign-out, User A's cached pantry data is readable on disk (though envelope org-ID check prevents loading into wrong org's UI).

### 1.3 Local storage (MASVS-STORAGE)

| ID | Finding | Severity | Status | Reference |
|----|---------|----------|--------|-----------|
| C-S1 | Snapshots scoped per `organizationId`; envelope rejects org mismatch on load | Info | Verified | [`SnapshotStore.swift:29-32,48,75`](../ios/Ration/Core/Persistence/SnapshotStore.swift) |
| C-S2 | Org switch clears all snapshots | Info | Verified | [`SessionStore.swift:56`](../ios/Ration/Core/Session/SessionStore.swift) |
| C-S3 | Atomic writes to Application Support (`ration-snapshots/`) | Info | Verified | [`SnapshotStore.swift:37`](../ios/Ration/Core/Persistence/SnapshotStore.swift) |
| C-S4 | **No app-layer encryption** — plain JSON on disk | Medium | Accepted | Relies on iOS Data Protection default (`CompleteUntilFirstUserAuthentication`) |
| C-S5 | **No explicit `FileProtectionType`** on snapshot writes | Medium | Open | [`SnapshotStore.swift:37`](../ios/Ration/Core/Persistence/SnapshotStore.swift) |
| C-S6 | Cached domains: hub, cargo, galley, manifest, supply — operational pantry PII | Info | Documented | [`SnapshotStore.swift`](../ios/Ration/Core/Persistence/SnapshotStore.swift), view models |
| C-S7 | **No tokens or credentials in UserDefaults** — only low-sensitivity UI dismiss flags | Info | Verified | [`NextActionDismissStore.swift`](../ios/Ration/Core/Filters/NextActionDismissStore.swift) |

### 1.4 Billing trust model (MASVS-CODE / App Store §3.1)

| ID | Finding | Severity | Status | Reference |
|----|---------|----------|--------|-----------|
| C-B1 | Server is source of truth for tier/credits — paywall loads `GET billing/status` | Info | Verified | [`PaywallView.swift`](../ios/Ration/Features/Billing/PaywallView.swift), [`RationAPI.swift`](../ios/Ration/Core/Networking/RationAPI.swift) |
| C-B2 | Post-purchase polls server for `crew_member.active` (up to ~5s) | Info | Verified | [`PaywallView.swift:35-63`](../ios/Ration/Features/Billing/PaywallView.swift) |
| C-B3 | RevenueCat `logIn(appUserId:)` ties SDK to Ration `user.id` | Info | Verified | [`BillingManager.swift:71-79`](../ios/Ration/Core/Billing/BillingManager.swift) |
| C-B4 | Client pre-checks credits before AI actions; server is ultimate gate | Info | Verified | [`AIFeatureIntroView.swift`](../ios/Ration/Features/Galley/AIFeatureIntroView.swift) |
| C-B5 | `purchase()` trusts RC entitlement `crew_member.isActive` client-side for UX branching | Low | Accepted | Server poll follows; credit packs skip poll by design |
| C-B6 | RevenueCat public API key in `Info.plist` (expected for RC; extractable from IPA) | Info | Documented | [`Info.plist:37-38`](../ios/Ration/App/Info.plist) |

---

## 2. Backend mobile-API security

### 2.1 Authentication & token lifecycle

| ID | Finding | Severity | Status | Reference |
|----|---------|----------|--------|-----------|
| B-A1 | JWT verification via `jose` (`jwtVerify`), HS256, audience `ration-mobile` | Info | Verified | [`token.server.ts:3,50-62`](../app/lib/mobile/token.server.ts) |
| B-A2 | Access TTL 15 min; refresh TTL 90 days; auth code TTL 60s | Info | Verified | [`constants.ts:2-4`](../app/lib/mobile/constants.ts) |
| B-A3 | Refresh tokens stored as SHA-256 hashes; rotation with family revocation on reuse | Info | Verified | [`token.server.ts:97-141`](../app/lib/mobile/token.server.ts) |
| B-A4 | PKCE S256 verified server-side with constant-time compare | Info | Verified | [`pkce.ts:32-69`](../app/lib/mobile/pkce.ts), [`v1.auth.token.ts:49-57`](../app/routes/api/mobile/v1.auth.token.ts) |
| B-A5 | Auth code single-use (KV delete on consume) | Info | Verified | [`token.server.ts:167-170`](../app/lib/mobile/token.server.ts) |
| B-A6 | Org ID from verified JWT claim, never from client body | Info | Verified | [`auth.server.ts:48-57`](../app/lib/mobile/auth.server.ts) |
| B-A7 | Org switch revokes all refresh families and issues new org-scoped pair | Info | Verified | [`v1.orgs.$id.activate.ts:25-31`](../app/routes/api/mobile/v1.orgs.$id.activate.ts) |

### 2.2 Rate limiting

| ID | Finding | Severity | Status | Reference |
|----|---------|----------|--------|-----------|
| B-R1 | AI submit endpoints rate-limited per userId: scan 20/min, generate 10/min, import 10/min, plan-week 5/min | Info | Verified | [`rate-limiter.server.ts:88-117,274-277`](../app/lib/rate-limiter.server.ts) |
| B-R2 | Auth endpoints rate-limited per IP: magic-link 20/min, token 60/min | Info | Verified | [`v1.auth.magic-link.ts:18-21`](../app/routes/api/mobile/v1.auth.magic-link.ts) |
| B-R3 | Status poll endpoints: 60/min per userId | Info | Verified | [`rate-limiter.server.ts:310-314`](../app/lib/rate-limiter.server.ts) |
| B-R4 | **Several GET endpoints have no rate limit:** `/session`, `/hub`, `/billing/status`, `/supply`, `/supply/snoozes`, `/orgs` | Medium | Open | Route files |
| B-R5 | Rate limiter **fail-open** on KV errors — availability over strict enforcement | Medium | Accepted | [`rate-limiter.server.ts:431-436,493-497`](../app/lib/rate-limiter.server.ts) |
| B-R6 | L1 in-memory cache per isolate — approximate limits (max +5s staleness) | Low | Accepted | [`rate-limiter.server.ts:52-55`](../app/lib/rate-limiter.server.ts) |

### 2.3 Route inventory & validation

**45 route files** under `app/routes/api/mobile/`, registered in [`app/routes.ts:260-362`](../app/routes.ts).

| Pattern | Count | Notes |
|---------|-------|-------|
| `requireMobileActiveGroup` (Bearer + org JWT + membership) | ~40 | All data/AI/mutation routes |
| `requireMobileAuth` only (user-scoped) | 5 | orgs, account, user avatar, auth session |
| Public (no auth) | 2 | magic-link, token exchange |

| ID | Finding | Severity | Status | Reference |
|----|---------|----------|--------|-----------|
| B-V1 | Zod validation at API boundary for all mutation endpoints | Info | Verified | [`app/lib/schemas/mobile/`](../app/lib/schemas/mobile/) |
| B-V2 | Cross-org IDOR prevented — org ID from JWT, 404 on mismatch | Info | Verified | e.g. [`v1.cargo.$id.ts`](../app/routes/api/mobile/v1.cargo.$id.ts), [`v1.scan.$requestId.ts:40-48`](../app/routes/api/mobile/v1.scan.$requestId.ts) |
| B-V3 | Upload MIME validation trusts client `Content-Type`; no magic-byte sniffing | Medium | Open | [`scan-submit.server.ts:32-37`](../app/lib/scan-submit.server.ts), [`v1.user.avatar.ts:71-77`](../app/routes/api/mobile/v1.user.avatar.ts) |
| B-V4 | Scan upload: 5 MB max, JPEG/PNG/WebP/PDF allowlist | Info | Verified | [`scan-submit.server.ts:11-16,40-42`](../app/lib/scan-submit.server.ts) |
| B-V5 | Avatar upload: 2 MB max, JPEG/PNG/WebP, rate-limited | Info | Verified | [`v1.user.avatar.ts:11-12,40-43`](../app/routes/api/mobile/v1.user.avatar.ts) |
| B-V6 | **`POST /scan` has no `requireMobileAIConsent`** — generate/import/plan-week do | High | Open | [`v1.scan.ts`](../app/routes/api/mobile/v1.scan.ts) vs [`v1.meals.generate.ts:25`](../app/routes/api/mobile/v1.meals.generate.ts) |
| B-V7 | Account deletion: `DELETE /account`, rate-limited (`user_purge` 1/5min), calls `purgeUserAccount` | Info | Verified | [`v1.account.ts:11-48`](../app/routes/api/mobile/v1.account.ts) |

### 2.4 Credits & billing security

| ID | Finding | Severity | Status | Reference |
|----|---------|----------|--------|-----------|
| B-C1 | Credit costs hardcoded server-side (scan 2, generate 2, import 1, plan-week 3) | Info | Verified | [`ledger.server.ts:18-24`](../app/lib/ledger.server.ts) |
| B-C2 | Atomic deduction via SQL `WHERE credits >= cost` + ledger insert | Info | Verified | [`ledger.server.ts:65-101`](../app/lib/ledger.server.ts) |
| B-C3 | `withCreditGate`: pre-check → deduct → execute → auto-refund on failure | Info | Verified | [`ledger.server.ts:244-279`](../app/lib/ledger.server.ts) |
| B-C4 | RevenueCat webhook: Bearer token must equal `REVENUECAT_WEBHOOK_SECRET` | Info | Verified | [`revenuecat.server.ts:39-49`](../app/lib/revenuecat.server.ts), [`webhook.revenuecat.tsx:18-20`](../app/routes/api/webhook.revenuecat.tsx) |
| B-C5 | Webhook idempotency via KV (7-day TTL); fulfillment gated by `REVENUECAT_FULFILLMENT_ENABLED` | Info | Verified | [`billing-idempotency.server.ts:14-40`](../app/lib/billing-idempotency.server.ts) |
| B-C6 | Insufficient credits → 402 with `required`/`current` (authenticated only) | Info | Verified | [`scan-submit.server.ts:87-96`](../app/lib/scan-submit.server.ts) |

### 2.5 Universal Links / AASA

| ID | Finding | Severity | Status | Reference |
|----|---------|----------|--------|-----------|
| B-U1 | AASA route implemented: `GET /.well-known/apple-app-site-association` → JSON, `Content-Type: application/json`, `Cache-Control: public, max-age=3600` | Info | Verified (code) | [`well-known.apple-app-site-association.ts`](../app/routes/well-known.apple-app-site-association.ts), [`aasa.ts:34-49`](../app/lib/aasa.ts) |
| B-U2 | App ID: `M2KJH5GDGH.com.mayutic.ration`; path: `/auth/mobile-callback/open` only | Info | Verified | [`aasa.ts:13-25`](../app/lib/aasa.ts) |
| B-U3 | Auth handoff: PKCE-bound one-time code, 60s KV TTL, single-use | Info | Verified | [`token.server.ts:148-170`](../app/lib/mobile/token.server.ts), [`auth.mobile-callback.tsx`](../app/routes/auth.mobile-callback.tsx) |
| B-U4 | **Production AASA returns HTTP 404** — route exists in codebase but not deployed | Critical | Open | Live curl 2026-06-30; other `.well-known/*` routes return 200 |
| B-U5 | Custom scheme fallback `ration://auth/callback?code=…` still functional | Info | Verified | [`auth-handoff.ts:16-26`](../app/lib/mobile/auth-handoff.ts) |

### 2.6 Error handling

| ID | Finding | Severity | Status | Reference |
|----|---------|----------|--------|-----------|
| B-E1 | Unhandled errors → 500 generic message, no stack traces | Info | Verified | [`error-handler.ts:120-126`](../app/lib/error-handler.ts) |
| B-E2 | D1 contention → 503 `server_busy` + `Retry-After: 5` | Info | Verified | [`error-handler.ts:103-117`](../app/lib/error-handler.ts) |
| B-E3 | 43 of 45 mobile routes use `handleApiError`; exceptions: `v1.auth.session.ts` (no try/catch) | Low | Open | [`v1.auth.session.ts:6-14`](../app/routes/api/mobile/v1.auth.session.ts) |
| B-E4 | Zod validation errors expose field-level `flatten()` details | Low | Accepted | [`error-handler.ts:35-39`](../app/lib/error-handler.ts) |

---

## 3. Apple App Review readiness

Reconciled against [`plans/app-review-notes.md`](app-review-notes.md) and current code/config.

### 3.1 Checklist

| Requirement | Guideline | Status | Evidence |
|-------------|-----------|--------|----------|
| Privacy manifest (`PrivacyInfo.xcprivacy`) | Required since May 2024 | **Fail** | Absent in app target; RevenueCat SDK ships its own |
| Required-Reason API declarations | ITMS-91053 | **Fail** | App uses `UserDefaults`, `FileManager`, camera/photo APIs — undeclared |
| App Privacy questionnaire alignment | §5.1.2 | **Unknown** | Must match manifest once created |
| Sign in with Apple | §4.8 | **N/A** | Magic-link email auth; no third-party social login |
| Account deletion in-app | §5.1.1(v) | **Pass** | Settings → Account → Delete; type `DELETE`; `DELETE /account` |
| In-App Purchases via StoreKit | §3.1.1 | **Pass** | Subscriptions + consumables via RevenueCat SDK only on iOS |
| Restore purchases | §3.1.1 | **Pass** | Settings → Manage billing → Restore |
| No external payment links for digital goods on iOS | §3.1.1 | **Pass** | Web Stripe honored as entitlement; new iOS purchases via Apple IAP |
| Camera usage description | §5.1.1(i) | **Pass** | `NSCameraUsageDescription` in Info.plist |
| Photo library usage description | §5.1.1(i) | **Pass** | `NSPhotoLibraryUsageDescription` in Info.plist |
| Push notification usage description | §5.1.1(i) | **N/A** | No notification code in iOS app; `NSUserNotificationsUsageDescription` not present (correct for current scope) |
| AI consent disclosure | §5.1.1(i) / §5.1.2 | **Partial** | Scan has client consent gate; server enforces on generate/import/plan-week but **not scan** |
| Privacy policy & Terms links | §5.1.1(i) | **Pass** | Settings → Privacy Policy / Terms; URLs in `AppConfig.swift` |
| Export compliance (`ITSAppUsesNonExemptEncryption`) | §2.5 | **Pass** | Set to `false` — HTTPS only, no custom crypto beyond Apple frameworks |
| Associated Domains entitlement | Universal Links | **Pass** (entitlement) | [`Ration.entitlements`](../ios/Ration/App/Ration.entitlements) |
| AASA file live in production | Universal Links | **Fail** | HTTP 404 (see B-U4) |
| Demo account for App Review | §2.1 | **Pending** | Operator must provide test email or pre-authenticated build notes |
| iPhone only, portrait | §2.4 | **Pass** | `LSRequiresIPhoneOS`, portrait-only orientations |
| Minimum OS version | §2.1 | **Pass** | iOS 17.0 deployment target |

### 3.2 Privacy manifest — required first-party content

When creating `PrivacyInfo.xcprivacy`, declare at minimum:

| Category | APIs used | Suggested reason |
|----------|-----------|------------------|
| User Defaults | `NextActionDismissStore` | `CA92.1` (access only by app) |
| File timestamp | `SnapshotStore`, `FileManager` | `C617.1` (app container files) |
| Camera / Photo library | `ScanView`, `AvatarUploadPicker` | System permission APIs (not Required-Reason) |
| Collected data types | Email, inventory, meal plans, receipt images | Declare per App Store Connect questionnaire |

RevenueCat SDK manifest is bundled automatically; the **app target still needs its own manifest** for first-party API usage.

### 3.3 IAP sandbox checklist (from app-review-notes)

| Test | Code support | Status |
|------|-------------|--------|
| Magic link sign-in on physical device | PKCE + custom scheme + Universal Link | Blocked until AASA deployed |
| Crew Member subscription + restore | RevenueCat + server poll | Ready (pending sandbox test) |
| Credit pack purchase → ledger update | RC webhook → `addCredits` | Ready (pending sandbox test) |
| Receipt scan → review → confirm | Scan queue + cargo batch | Ready |
| Account deletion end-to-end | `AccountDeletionView` → `DELETE /account` → local wipe | Ready |

---

## 4. Native features & best practices

### 4.1 Architecture

| Area | Assessment | Reference |
|------|------------|-----------|
| SwiftUI + `@Observable` | Modern, appropriate for iOS 17+ | Feature modules under `ios/Ration/Features/` |
| Dependency injection | `AppEnvironment` container at app root | [`RationApp.swift`](../ios/Ration/App/RationApp.swift) |
| Offline-first snapshots | Per-org scoped cache with sync metadata | [`SnapshotStore.swift`](../ios/Ration/Core/Persistence/SnapshotStore.swift) |
| XcodeGen project generation | Reproducible `.xcodeproj` from `project.yml` | [`ios/project.yml`](../ios/project.yml) |
| SPM dependency management | RevenueCat `purchases-ios` ≥ 5.0.0 | [`project.yml:17-20,42-43`](../ios/project.yml) |

### 4.2 Security-relevant native patterns

| Pattern | Implementation | Verdict |
|---------|---------------|---------|
| Keychain for secrets | Custom wrapper, no third-party dep | Good |
| CryptoKit for PKCE S256 | Native, no custom crypto | Good |
| Ephemeral URLSession for API | No persistent cache for auth'd requests | Good |
| Single-flight async refresh | `Task` coalescing in `AuthManager` | Good |
| `@MainActor` isolation | Auth, session, snapshots on main actor | Good |
| Image resize before upload | Client-side 2MB cap for avatars | Good |
| Scan image in-memory only | Not written to disk; JPEG resize before upload | Good |

### 4.3 Test coverage

| Area | Tests | File |
|------|-------|------|
| PKCE RFC vector | Pass | [`BaseLayerTests.swift`](../ios/RationTests/BaseLayerTests.swift) |
| Auth URL parsing / rejection | Pass | [`BaseLayerTests.swift`](../ios/RationTests/BaseLayerTests.swift) |
| Avatar URL allowlist (SSRF) | Pass | [`AvatarURLResolverTests.swift`](../ios/RationTests/AvatarURLResolverTests.swift) |
| Snapshot org scoping | Pass | [`SnapshotStoreSyncStateTests`](../ios/RationTests/) |
| Hub layout engine | Pass | [`HubLayoutEngineTests.swift`](../ios/RationTests/HubLayoutEngineTests.swift) |
| Directions parser | Pass | [`DirectionsParserTests.swift`](../ios/RationTests/DirectionsParserTests.swift) |
| Billing configure guard | Pass | [`BaseLayerTests.swift`](../ios/RationTests/BaseLayerTests.swift) |

**58 XCTest cases pass.** No UI/integration tests for auth flow, billing purchase, or account deletion — acceptable for v1 but recommended for App Review confidence.

### 4.4 Gaps

| ID | Finding | Severity | Reference |
|----|---------|----------|-----------|
| N-1 | No pre-flight camera authorization check — relies on system picker prompt | Low | [`ScanView.swift:317-345`](../ios/Ration/Features/Scan/ScanView.swift) |
| N-2 | Generate/import/plan-week lack client-side AI consent gate (scan has one) | Medium | [`AIFeatureIntroView.swift`](../ios/Ration/Features/Galley/AIFeatureIntroView.swift) |
| N-3 | Privacy settings allows PATCH `aiConsentAt: nil` despite footer saying consent stays on record | Low | [`PrivacySettingsView.swift:71-73`](../ios/Ration/Features/Settings/PrivacySettingsView.swift) |
| N-4 | `DEVELOPMENT_TEAM` hardcoded in `project.yml` | Info | [`project.yml:15,35`](../ios/project.yml) |
| N-5 | Marketing version in XcodeGen (`1.0.0`) drift from server version (`1.4.5`) | Low | [`project.yml:11`](../ios/project.yml) vs [`version.ts`](../app/lib/version.ts) |

---

## 5. Scale readiness for iOS download growth

### 5.1 Infrastructure topology

Source: [`wrangler.jsonc`](../wrangler.jsonc)

| Binding | Purpose | Scale note |
|---------|---------|------------|
| D1 (`DB`) | Primary datastore | Paid plan; 100 bound-param limit enforced via `query-utils.server.ts` |
| KV (`RATION_KV`) | Auth codes, rate limits, tier cache, webhook idempotency | ~1 write/sec per key; hot-key risk on shared NAT IPs |
| R2 (`STORAGE`) | Scan images, avatars | No lifecycle policy for `scan-pending/*` orphans |
| Vectorize | Semantic cargo search | Paid plan; not blocking at current scale |
| Workers AI (`AI`) | Embeddings only (vision via AI Gateway) | Metered per use |
| Queues (×4) | scan, meal-generate, plan-week, import-url | Batch 3–5, max_retries 3, no DLQ configured |
| Durable Objects | **None** | No global coordination for AI concurrency |
| Cron | Daily 03:00 UTC — session/queue_job purge, orphan cleanup | [`wrangler.jsonc:169-170`](../wrangler.jsonc) |
| Smart Placement | Enabled — co-locate compute near D1 | [`wrangler.jsonc:38-40`](../wrangler.jsonc) |

### 5.2 Bottleneck priority by user tier

| Priority | Area | 10K active | 100K active | 1M+ active |
|----------|------|-----------|-------------|------------|
| **High** | `GET /hub` — ~10 parallel ops including 3× `matchMeals` + full supply list, no rate limit | Noticeable latency | Hot path cost | Major D1/Vectorize spend |
| **High** | `GET /supply` — unbounded item fetch per request | OK for small lists | Slow payloads | Memory/latency failures |
| **High** | `GET /meals/match` — loads all org meals without `preLimit` | OK (free tier cap) | Crew Member risk | Worker CPU timeouts |
| **High** | Orphaned `scan-pending/*` R2 objects on scan failure | Minor storage | Growing cost | Unbounded R2 bill |
| **Medium** | AI job polling → D1 read volume (60/min/user, no cache) | Fine | Monitor D1 reads | Consider push notifications |
| **Medium** | Rate limiter fail-open + approximate L1 | Acceptable | Abuse surface | Needs hard AI caps |
| **Medium** | No dead-letter queue for exhausted AI job retries | OK | Debug pain | Ops risk |
| **Medium** | Meals list: limit-only, no cursor pagination | UX limit | Crew Member gap | API incomplete |
| **Medium** | Missing composite indexes on `(organizationId, createdAt)` for cargo/meals | Latent | Crew Member orgs | Table scans |
| **Low** | KV rate-limit write amplification | Fine | Cost noise | Manageable |
| **Low** | No APM/alerting beyond console logs + CF dashboard | OK | Blind spots | Production incident risk |

### 5.3 Free tier vs Crew Member

Free tier natural caps (35 cargo / 15 meals per [`tiers.server.ts`](../app/lib/tiers.server.ts)) limit DB pressure. **Crew Member unlimited inventory** is where unbounded reads, missing indexes, and hub fan-out become production risks.

### 5.4 Observability gap

| Capability | Status |
|------------|--------|
| Workers Observability | Enabled (`wrangler.jsonc:10-12`) |
| Structured logging | `console.info/warn/error` only ([`logging.server.ts`](../app/lib/logging.server.ts)) |
| Sentry / Logpush / Analytics Engine | **Not configured** |
| Custom metrics / alerting | **Not configured** |

At 100K+ users, diagnosing D1 contention, queue backlog, KV fail-open, or AI cost spikes will require adding APM or Cloudflare Logpush.

### 5.5 iOS client scale considerations

| Factor | Assessment |
|--------|------------|
| Offline snapshot size | Grows with org inventory; no size cap or eviction policy |
| Concurrent tab reload on org switch | All tabs reload via `orgGeneration` — acceptable at current scale |
| Polling interval for AI jobs | 1.5s × up to 80 attempts (~120s) per job — bounded per user |
| Memory | Scan images held in-memory only; resized to 1024px JPEG |

---

## 6. Positive controls (preserved)

These controls were verified intact and should not regress:

- PKCE S256 magic-link auth with single-use KV codes and 60s TTL
- Refresh token rotation with family revocation on reuse
- Keychain storage with `AfterFirstUnlockThisDeviceOnly` accessibility
- Org-scoped JWT claims enforced server-side on every data route
- Atomic server-side credit deduction with auto-refund on AI failure
- RevenueCat webhook Bearer auth + KV idempotency
- Avatar URL resolver SSRF protection (allowlist-only)
- Upload size/MIME limits on scan (5 MB) and avatars (2 MB)
- Rate limiting on all AI submit endpoints and auth public endpoints
- Error handler sanitizes 500 responses (no stack traces)
- Org switch clears all offline snapshots and reloads tabs
- Explicit sign-out clears snapshots, RevenueCat session, and Keychain
- Account deletion with confirmation phrase + server-side purge
- No secrets logged; no tokens in UserDefaults
- D1 batch/chunk helpers used consistently in lib modules
- Prior security gates passed: [`ios-polish-pass-2-security.md`](ios-polish-pass-2-security.md), [`ios-polish-pass-3-security.md`](ios-polish-pass-3-security.md)

---

## 7. Prioritized backlog

### Critical (App Store blockers)

| ID | Finding | Fix |
|----|---------|-----|
| CR-1 | Missing first-party `PrivacyInfo.xcprivacy` | Create manifest in app target; declare Required-Reason APIs and collected data types; align App Store Connect questionnaire |
| CR-2 | Production AASA returns 404 | Deploy latest Worker build containing [`well-known.apple-app-site-association.ts`](../app/routes/well-known.apple-app-site-association.ts); verify with curl + physical device Universal Link test |

### High

| ID | Finding | Fix |
|----|---------|-----|
| H-1 | `/scan` lacks server-side `requireMobileAIConsent` | Add consent check to [`v1.scan.ts`](../app/routes/api/mobile/v1.scan.ts) matching generate/import/plan-week |
| H-2 | `signOutLocal()` leaves offline snapshots on disk | Call `snapshots.clearAll()` and clear `SessionStore` cache in forced logout path |
| H-3 | `GET /hub` unbounded parallel fan-out | Add rate limit; bound supply/meal-match reads; consider response caching |
| H-4 | `GET /supply` unbounded item fetch | Add pagination or server-side limit |
| H-5 | `GET /meals/match` loads full org catalog | Add `preLimit` matching hub widget pattern |
| H-6 | Orphaned `scan-pending/*` R2 objects | Add cron cleanup or R2 lifecycle rule for objects older than 24h |
| H-7 | No production observability beyond console logs | Add Logpush, Analytics Engine, or Sentry for mobile API + queue consumers |
| H-8 | AI consent inconsistent across features (client + server) | Add client consent gates to generate/import/plan-week; align Privacy settings copy |

### Medium

| ID | Finding | Fix |
|----|---------|-----|
| M-1 | 401 retry replays non-idempotent POST bodies | Skip body replay for multipart/scan; use idempotency keys |
| M-2 | Decoding errors may leak response fragments | Sanitize `APIError.decoding` messages in client |
| M-3 | `AuthImageLoader` uses shared URLSession with disk cache | Switch to ephemeral session or disable cache |
| M-4 | Unrated GET endpoints (`/session`, `/hub`, `/supply`, `/orgs`) | Add read-rate limits |
| M-5 | Upload MIME trusts client Content-Type | Add magic-byte validation server-side |
| M-6 | Snapshot files lack explicit `FileProtectionType` | Set `.completeUnlessOpen` or `.complete` on write |
| M-7 | No dead-letter queue for AI jobs | Configure DLQ in wrangler; add monitoring |
| M-8 | Meals list lacks cursor pagination | Add cursor param to mobile meals endpoint |
| M-9 | Missing `(organizationId, createdAt)` composite indexes | Generate Drizzle migration |
| M-10 | Rate limiter fail-open on KV errors | Add circuit-breaker alert; consider D1-backed counters for AI |
| M-11 | No global AI concurrency cap | Add queue consumer concurrency limit or per-platform budget |
| M-12 | PKCE verifier not deleted on `signOutLocal()` | Delete `pkce_verifier` key in sign-out paths |
| M-13 | `v1.auth.session.ts` lacks `handleApiError` | Wrap in try/catch |
| M-14 | iOS marketing version drift (`1.0.0` vs `1.4.5`) | Sync `project.yml` MARKETING_VERSION with server version |

### Low

| ID | Finding | Fix |
|----|---------|-----|
| L-1 | No TLS pinning | Defer to L2 hardening pass |
| L-2 | No custom URLSession timeouts | Add differentiated timeouts for uploads |
| L-3 | Transport errors expose system messages | Map to user-friendly messages |
| L-4 | Keychain operation return codes ignored | Check and surface errors |
| L-5 | `X-Ration-Client` header hardcoded `ios/1.0.0` | Derive from bundle version |
| L-6 | Privacy settings allows revoking AI consent | Align UI copy with behavior or prevent nil PATCH |
| L-7 | No pre-flight camera authorization | Add `AVCaptureDevice.authorizationStatus` check |
| L-8 | `http` scheme accepted in universal link parser (dev) | Restrict to `https` in release builds |
| L-9 | Corporate NAT shared IP on auth rate limits | Consider per-email rate limit alongside IP |
| L-10 | No iOS UI/integration tests for auth or billing | Add XCTest UI tests for critical paths |

---

## 8. Sign-off

| Phase | Status |
|-------|--------|
| Static code analysis | **Done** |
| Live verification (tests, lint, typecheck, ios:check, production AASA) | **Done** |
| OWASP MASVS L1 mapping | **Done** |
| Apple App Review checklist | **Done** |
| Scale readiness assessment | **Done** |
| App Store submission readiness | **Fail** — CR-1 (privacy manifest) + CR-2 (AASA deployment) |

### Recommended submission sequence

1. Create and validate `PrivacyInfo.xcprivacy` (Xcode → Product → Generate Privacy Report)
2. Deploy Worker with AASA route; verify Universal Link on physical device
3. Fix H-1 (scan AI consent server gate) and H-2 (forced logout snapshot wipe)
4. Prepare App Review notes with demo account email ([`app-review-notes.md`](app-review-notes.md))
5. Run sandbox IAP checklist (subscription, credit pack, restore, account deletion)
6. Submit to App Store Connect

### Follow-up remediation plan

After submission (or in parallel with review), address High scale items (H-3 through H-7) in a dedicated post-launch hardening sprint. Prior audits [`ios-polish-pass-2-security.md`](ios-polish-pass-2-security.md) and [`ios-polish-pass-3-security.md`](ios-polish-pass-3-security.md) remain valid; this audit extends their scope to full App Store readiness and scale planning.

---

*Report generated per audit plan `ios-security-&-app-store-audit`. No application code was modified during this audit pass.*
