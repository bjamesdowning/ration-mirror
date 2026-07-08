# Ration iOS (Stream C + Post-MVP Polish)

Native SwiftUI client for Ration, talking to the `/api/mobile/v1/*` Bearer-token API.
Entitlements are owned by RevenueCat; the app reads `user.tier`/credits from the
server and purchases via the RevenueCat SDK.

## Requirements

- Xcode 15+ (iOS 17 deployment target)
- [XcodeGen](https://github.com/yonyz/XcodeGen) to generate the `.xcodeproj` from `project.yml`:
  ```bash
  brew install xcodegen
  ```

## Generate & run

```bash
cd ios
xcodegen generate      # writes Ration.xcodeproj from project.yml
open Ration.xcodeproj
```

Set your **Apple Developer Team ID** in `project.yml` (`DEVELOPMENT_TEAM`) before
building to a device, then re-run `xcodegen generate`.

### First-class repo commands

Run these from the repository root:

```bash
bun run ios:generate  # regenerate Ration.xcodeproj after Swift file/project.yml changes
bun run ios:build     # xcodebuild app build
bun run ios:test      # XCTest target
bun run ios:check     # generate + build + test
```

Builds use `generic/platform=iOS Simulator` for portability. XCTest cannot run on
that abstract destination, so `ios:test`/`ios:check` auto-resolve a concrete
simulator — the first **Booted** iPhone if one is running, otherwise the first
available iPhone. To pin a specific simulator (used for both build and test):

```bash
IOS_DESTINATION="platform=iOS Simulator,name=iPhone 17" bun run ios:check
```

If Xcode reports `Cannot find 'SomeView' in scope` after adding a Swift file,
the generated project is stale. Run `bun run ios:generate`, then build again
with **⌘R** in Xcode.

### Pointing at a local backend

The app defaults to `https://ration.mayutic.com/api/mobile/v1`. To test against a
local `bun run dev`, add a `RATION_API_BASE` environment variable to the Run scheme
(e.g. `http://localhost:5173/api/mobile/v1`). Note the `ration://` magic-link
callback requires the universal-link/redirect to reach the device.

## Architecture

```
Ration/
├── App/            # @main entry, DI container, auth-gated root, tab shell
├── Core/
│   ├── Design/     # Theme, Typography (Space Mono), ListCountHeader, ListRowViews, VisualLanguage.md
│   ├── Filters/    # PageFilterState, FilterOptionsSheet (Cargo/Galley/Supply)
│   ├── Session/    # SessionStore — global org context + credits + AI consent
│   ├── Consent/    # AIConsentCoordinator — shared "proceed" gate for all 4 AI entry points
│   ├── Persistence/# SnapshotStore — org-scoped offline cache
│   ├── Networking/ # APIClient (auto token refresh), RationAPI facade, config
│   ├── Auth/       # AuthManager (token lifecycle), Keychain wrapper
│   ├── Billing/    # RevenueCat SDK boundary
│   └── Models/     # Codable types matching mobile API responses
└── Features/
    ├── Auth/       # Magic-link + Apple/Google social sign-in
    ├── Dashboard/  # Hub widget grid (GET /hub), customize layout
    ├── Cargo/      # Paginated list + filters + FAB
    ├── Supply/     # Shopping list with filters + dock FAB
    ├── Scan/       # Camera capture → resize → POST /scan
    ├── Galley/     # Meals CRUD, AI generate/import, match mode
    ├── Manifest/   # Week navigation, plan-week AI, consume
    ├── Settings/   # Account settings (profile, tier, appearance, privacy, sign out)
    │               # GroupSettingsView — org switch, members, invite, credits transfer
    └── Billing/    # Paywall (RevenueCat SDK)
```

### Global shell (all tabs)

- **Leading:** `OrgSwitcherBar` — org avatar, credits, CREW pill; tap pushes **Group Settings** (members, invite, create group, transfer credits, danger zone).
- **Trailing:** `PageOptionsButton` (filters/options sheet) + `ProfileAvatarButton` (tap opens **Account Settings** sheet).
- **Org switch:** invalidates org-scoped snapshots and reloads all tabs via `orgGeneration`.

### Auth flow

**Social sign-in (v1.4.49+):** Sign in with Apple (`AuthenticationServices`) and
Google (`GoogleSignIn-iOS` SPM) obtain provider ID tokens natively. The app calls
`POST /auth/social` with the token (and Apple nonce); the server verifies via Better
Auth and returns the same JWT pair as magic-link auth. The auth screen offers **Sign In**
and **Create Account** modes: returning users sign in without a ToS checkbox; new
accounts must accept Terms of Service and Privacy Policy before any method. Configure:

- **Apple:** Enable Sign in with Apple on App ID `com.mayutic.ration` in the Apple
  Developer portal (entitlement `com.apple.developer.applesignin` is in `project.yml`).
- **Google:** Set `GOOGLE_IOS_CLIENT_ID` and `GOOGLE_IOS_URL_SCHEME` in `project.yml`
  (or scheme env vars). `GOOGLE_IOS_URL_SCHEME` is the reversed client ID
  (`com.googleusercontent.apps.<prefix>` — see `AppConfig.googleIOSURLScheme`).
  This populates `GIDClientID` and the Google callback URL scheme in `Info.plist`.

**Cross-platform sign-in:** One Ration account per person. After signing up on iOS with
Apple (including Hide My Email), sign in on [ration.mayutic.com](https://ration.mayutic.com)
with **Sign in with Apple** using the same Apple ID — not Google or a different email.
Google and magic link unify by verified email when the addresses match.

**Magic link (PKCE):** The flow uses **PKCE** so the one-time code is bound to this app — an app that
hijacks the `ration://` scheme cannot redeem an intercepted code without the
verifier.

1. App generates a PKCE `verifier` (saved in the Keychain) and
   `POST /auth/magic-link { email, codeChallenge }` (S256 challenge) → user taps the email link.
2. Link opens `/auth/mobile-callback?client=ios&code_challenge=…` → the challenge
   is bound to a one-time KV code (60s TTL) → redirects to `ration://auth/callback?code=…`.
3. `RationApp.onOpenURL` extracts the code → `POST /auth/token { grantType: "authorization_code", code, codeVerifier }`.
   The server recomputes `S256(verifier)` and rejects a mismatch with `invalid_grant`.
4. Access (15 min) + refresh (90 day) tokens are stored in the Keychain.
   `APIClient` auto-refreshes on 401 via single-flight rotation.

**Org switching** calls `POST /orgs/:id/activate`, which returns a **new** org-scoped
token pair (prior refresh families are revoked server-side); the app adopts it via
`SessionStore.activateOrg` then reloads all tabs.

## Mobile API routes (v1.3.48+)

### Existing (MVP)

| Route | Method | Purpose |
|-------|--------|---------|
| `/auth/social` | POST | Apple/Google ID token → mobile JWT pair |
| `/auth/magic-link` | POST | Request magic link (PKCE challenge) |
| `/auth/token` | POST | Exchange auth code or refresh token |
| `/session` | GET | User, org, credits, tier, `aiCosts` |
| `/cargo`, `/cargo/:id`, `/cargo/batch` | GET/POST/PATCH/DELETE | Inventory CRUD |
| `/meals`, `/meals/:id`, `/meals/match` | GET | Galley browse + match |
| `/meals/:id/cook`, `/meals/:id/toggle-active` | POST | Cook + supply selection |
| `/supply`, `/supply/items`, `/supply/sync`, `/supply/complete` | various | Supply list |
| `/manifest`, `/manifest/consume` | GET/POST | Meal plan |
| `/scan`, `/scan/:requestId` | POST/GET | Visual scan AI |
| `/settings` | GET/PATCH | User preferences |
| `/orgs/:id/activate` | POST | Org switch |

### New (post-MVP polish)

| Route | Method | Purpose |
|-------|--------|---------|
| `/hub` | GET | Widget grid data + layout |
| `/cargo/tags`, `/cargo/tag-index` | GET | Filter tag sources |
| `/meals/tags` | GET | Galley tag picker |
| `/meals` | POST | Create meal(s) |
| `/meals/:id` | PATCH/DELETE | Edit/delete meal |
| `/meals/generate`, `/meals/generate/:requestId` | POST/GET | AI meal ideas (2 credits) |
| `/meals/import`, `/meals/import/:requestId`, `/meals/import/confirm` | POST/GET/POST | URL import (1 credit) |
| `/manifest/plan-week`, `/manifest/plan-week/:requestId` | POST/GET | AI week plan (3 credits) |
| `/manifest/bulk` | POST | Bulk add plan entries |
| `/manifest/entries/:entryId` | DELETE | Remove manifest entry |
| `/groups/members` | GET | List group members |
| `/groups` | POST | Create group |
| `/groups/delete` | POST | Delete group (owner) |
| `/groups/invitations/create` | POST | Create invite link |
| `/groups/members/:memberId/role` | PATCH | Change member role |
| `/groups/ownership/transfer` | POST | Transfer group ownership |
| `/groups/credits/transfer` | POST | Transfer credits between owned groups |

Settings PATCH accepts `hubProfile` and `hubLayout` for customizable Hub widgets. Per-widget filters include meal tags, manifest day span (1/3/7/14), supply cargo tags, slot/domain, and limits — synced with web `hubLayout`. **Appearance** (Settings → Light/Dark segmented control) updates `user.settings.theme` and syncs with the web app; choice is cached in UserDefaults for instant cold start.

**Post-buildout UX overhaul (v1.4.18):** Trailing `ListCountHeader` (`"{n} items"`) on Cargo, Galley, and Manifest; toolbar count pill removed. Space Mono typography shipped with Dynamic Type scaling. Unified Telemetry Strip rows (`CargoRowView` / `MealRowView`) with hyper-green tag chips. Rich connected-meals section on Cargo detail (connection badges, all ingredients, sort). Manifest incremental polish (consumed strikethrough, week navigator density). See [`VisualLanguage.md`](Ration/Core/Design/VisualLanguage.md).

**Post-buildout polish (v1.4.4–1.4.5):** Conditional sync indicator in toolbar (offline/stale only); structured recipe directions with step UI; unified AI intro+form flows; hub widgets are tappable with detail sheets; manifest preview supports day-span filters and consume-from-hub; Supply uses thin progress bar + icon dock FAB. **v1.4.5** adds icon-only action menus on Cargo/Galley/Manifest/Hub, hub layout presets (Full/Cook/Shop/Minimal), per-widget S/M/L size editing, and slot glyphs on manifest rows.

**Security hardening (v1.4.6–v1.4.11, iOS security audit fix plan):** `PrivacyInfo.xcprivacy` privacy manifest (v1.4.6); centralized/symmetric AI consent gate across all four AI entry points via `SessionStore.hasAIConsent` + `AIConsentCoordinator`, and server-side consent enforcement added to `/scan` (v1.4.8); forced-logout full wipe (`AuthManager.onSignedOut` → snapshots/billing/session/image caches) plus abandoned-PKCE-verifier Keychain cleanup on every sign-out (v1.4.9); mobile `/hub` and `/supply` rate limiting + pagination, and a `preLimit` fix for `/meals/match` (v1.4.10); post-review cleanup — explicit sign-out now routes through the same `onSignedOut` wipe hook instead of duplicating it, and `RootView`'s startup fetches (`session.load`, settings) run concurrently and are shared between the AI consent flag and the onboarding check instead of double-fetching `/settings` (v1.4.11). See [`plans/ios-security-audit-fix-plan.md`](../plans/ios-security-audit-fix-plan.md).

**Copilot dual-dock (v1.5.20):** Global `CopilotFloatingBar` on all tab screens uses a **dual-dock** layout — Copilot input/collapse chip on the leading edge, tab action FABs (`IconFAB`) on the trailing edge with a reserved 72pt gutter (`CopilotDockLayout`). Scroll down to collapse the bar to a chat icon; scroll up to re-expand. List content scrolls underneath the floating glass controls via increased bottom insets (`copilotBarBottomPadding`). Full chat opens in `AskView` sheet; inline send from the bar auto-opens the sheet. WebSocket frames use lenient agent-protocol parsing (`CopilotWebSocketDecoder`) matching web `AskPanel` — terminal `done` frames and unknown chunks are ignored instead of surfacing decode errors.

**Copilot device QA checklist (before release):**
- Galley/Cargo: scroll down collapses Copilot bar; scroll up re-expands; `+` FAB remains tappable while bar is expanded.
- Ask sheet: send a tool turn (e.g. “add butter to cargo”) — tool card appears, no red decode error banner after completion.
- Hub: scan FAB and Copilot bar coexist without overlap.
- Tab switch resets bar to expanded when allowance allows auto-expand.

## Security notes

- Tokens live in the Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
- The magic-link → code exchange is PKCE-protected (S256), so the `ration://`
  custom scheme cannot be abused to steal an intercepted auth code. Any orphaned
  verifier (e.g. an abandoned magic-link request) is deleted from the Keychain on
  every sign-out, not just a successful code exchange.
- No secrets are committed (`.gitignore` excludes `*.p8`, `Secrets.xcconfig`, provisioning).
- All requests are HTTPS; org isolation is enforced server-side from the JWT claim.
- Offline snapshots are scoped per `organizationId`; org switch clears stale cache.
  A **forced logout** (401 from an expired/revoked token) runs the same full wipe
  as explicit sign-out — snapshots, billing session state, the in-memory
  `SessionStore` cache, and cached authenticated images — via
  `AuthManager.onSignedOut`, wired once in `AppEnvironment.init()`. This closes a
  shared-device cross-account data leakage gap where a forced logout previously
  left another user's cached pantry/session data readable by the next sign-in.
- AI features require `aiConsentAt` in settings; server returns 403 `ai_consent_required`
  otherwise (enforced on all four AI entry points: scan, generate, import, plan-week).
  Client-side, a single `SessionStore.hasAIConsent` flag (loaded once at app start)
  and a shared `AIConsentCoordinator` ensure the full-screen consent gate is shown
  at most once across all four entry points, regardless of which one the user
  reaches first.
