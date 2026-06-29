# Ration iOS (Stream C)

Native SwiftUI client for Ration, talking to the `/api/mobile/v1/*` Bearer-token API.
Entitlements are owned by RevenueCat; the app reads `user.tier`/credits from the
server and (in Stream C7) purchases via the RevenueCat SDK.

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
│   ├── Design/     # Theme (Ceramic/Hyper-Green/Carbon), Typography, components
│   ├── Networking/ # APIClient (auto token refresh), RationAPI facade, config
│   ├── Auth/       # AuthManager (token lifecycle), Keychain wrapper
│   ├── Billing/    # RevenueCat SDK boundary
│   └── Models/     # Codable types matching mobile API responses
└── Features/
    ├── Auth/       # Magic-link sign-in
    ├── Dashboard/  # Hub aggregate (GET /dashboard)
    ├── Cargo/      # Paginated list + create (cursor pagination)
    ├── Supply/     # Shopping list with check-off
    ├── Scan/       # Camera capture → resize → POST /scan
    ├── Galley/     # Meals browse/detail
    ├── Settings/   # Session, org switcher, sign out
    └── Billing/    # Paywall (REST status; RevenueCat SDK = C7)
```

### Auth flow

The flow uses **PKCE** so the one-time code is bound to this app — an app that
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
`AuthManager.adopt(_:)` then reloads the session.

## Remaining work

- **C5 — Scan:** capture, upload, and status polling are wired. A richer confirm-into-cargo review step remains for post-MVP polish. Document edge detection (Vision) is a later enhancement.
- **C6 — Galley:** browse and detail views are wired to `/meals` and `/meals/:id`.
- **C7 — Paywall:** RevenueCat SDK login, offering-driven purchase buttons, and restore are wired (`BillingManager`). Set `RevenueCatPublicAPIKey` in `Info.plist` with the public iOS SDK key and configure a RevenueCat offering whose current packages include the Crew Member product; the remaining work is App Store sandbox verification before external TestFlight.
- **Audit Gate:** code P0 findings are tracked in `plans/stream-c-audit-gate.md`; TestFlight remains gated on Apple/RevenueCat configuration and sandbox purchase verification.
- **Brand font:** optionally bundle Space Mono TTFs and register `UIAppFonts`
  (currently falls back to the system monospaced design).

## Security notes

- Tokens live in the Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
- The magic-link → code exchange is PKCE-protected (S256), so the `ration://`
  custom scheme cannot be abused to steal an intercepted auth code.
- No secrets are committed (`.gitignore` excludes `*.p8`, `Secrets.xcconfig`, provisioning).
- All requests are HTTPS; org isolation is enforced server-side from the JWT claim.
