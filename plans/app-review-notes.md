# App Review Notes (Ration iOS)

Use this document when submitting to App Review or TestFlight external testing.

## Login

- **Methods:** Sign in with Apple, Google Sign-In, or magic-link email with PKCE (App Store Guideline 4.8 — Apple is offered alongside Google).
- **Social (iOS):** Native SDKs obtain provider ID tokens; the app calls `POST /api/mobile/v1/auth/social` and receives the standard mobile JWT pair. ToS acceptance is required before any sign-in method.
- **Magic link:** Email links land on a scanner-safe interstitial (`/auth/magic-link/continue`); the user taps **Continue sign-in** before Better Auth verifies the token.
- **Handoff (primary):** Universal Link `https://ration.mayutic.com/auth/mobile-callback/open?code=…` (Associated Domains `applinks:ration.mayutic.com`). After email verification, the user taps **Open Ration** on `/auth/mobile-callback`; iOS opens the app directly.
- **Handoff (fallback):** Custom URL scheme `ration://auth/callback?code=…`, used only if Universal Links don't fire (app not installed, AASA not yet cached). The code is a single-use, PKCE-bound UUID with a 300s TTL.

### Demo account (Guideline 2.1 — required for App Review)

Do **not** rely on Sign in with Apple / Google alone for App Review. Use the Flagship-gated review login:

1. **Seed** (idempotent): `bun scripts/seed-app-review-demo.ts --remote` then set Wrangler secrets `APP_REVIEW_DEMO_EMAIL` (`app-review@mayutic.com`), `APP_REVIEW_DEMO_PASSWORD`, `APP_REVIEW_DEMO_USER_ID`.
2. **Flagship:** create boolean flag `app-review-login` (default off). **Enable before** submitting / replying to review; **disable after** approval or between review windows (no redeploy). Emergency: `FEATURE_FLAG_OVERRIDES` `{"app-review-login":false}`.
3. **App Store Connect** → TestFlight → Test Information → Beta App Review Information → check **Sign-in required** → User Name `app-review@mayutic.com` / Password = secret.
4. **Notes for Review** (paste):

```text
Sign-in: On Sign In, enter User Name (app-review@mayutic.com) in Email —
a Password field then appears. Enter the Password from Review Information
and tap Continue. Do not use Sign in with Apple / Google.
No 2FA. Account is pre-seeded (Cargo, Galley, Manifest, Supply).
AI features may show a one-time privacy consent gate.
Backend: https://ration.mayutic.com — live, no VPN.
```

5. Reply in the Resolution Center that credentials are filled and the account is ready.

**UX:** Password appears only when Flagship `appReviewLogin` is on **and** the email field equals `app-review@mayutic.com`. Endpoint: `POST /api/mobile/v1/auth/review-login`. Unsigned flags: `GET /api/mobile/v1/client-flags`.

### Universal Links operator checklist

- [x] **CR-2 (production AASA):** Fixed in v1.4.48 — Worker allow-list omission. Verified 2026-07-06: origin and Apple CDN return `200` with `appID: M2KJH5GDGH.com.mayutic.ration` and `paths: ["/auth/mobile-callback/open"]`.
- [x] Apple CDN propagated — verified 2026-07-06 via `curl -si https://app-site-association.cdn-apple.com/a/v1/ration.mayutic.com`.
- [ ] App is signed with a provisioning profile that includes the **Associated Domains** capability.
- [ ] On a physical device, tapping the magic-link "Open Ration" button opens the app (not Safari). Re-run with production entitlement (`applinks:ration.mayutic.com`, no `?mode=developer`) — AASA origin and Apple CDN verified 2026-07-06.
- [ ] Custom-scheme fallback still completes sign-in when Universal Links are unavailable.

## In-App Purchases

- **Subscriptions:** Crew Member via RevenueCat / App Store.
- **Consumables:** Credit packs (`credits_s`, `credits_m`, `credits_l`, `credits_xl`) via RevenueCat consumable products.
- **Restore:** Settings → Manage billing → Restore purchases.
- **Web Stripe:** Existing Stripe subscriptions are honored as account entitlements but new purchases on iOS use Apple IAP only.

## Account Deletion

- Path: **Settings → Account → Delete account**
- Requires typing `DELETE` to confirm.
- Permanently removes inventory, meals, supply, manifest, scans, and sessions.

## AI / Privacy

- The first AI feature the user reaches — **any of** receipt scan, Generate meals, Import recipe, or Plan week — shows the **AI Processing & Receipt Privacy** consent gate exactly once; accepting from any one clears it for the other three (no repeat prompts, in-session or after app restart). Enforced server-side on all four AI submit endpoints (403 `ai_consent_required` if bypassed).
- Consent state: Settings → Privacy & AI.
- Privacy policy: https://ration.mayutic.com/legal/privacy
- Terms: https://ration.mayutic.com/legal/terms
- `PrivacyInfo.xcprivacy` privacy manifest is present in the app bundle (declared API reasons: `UserDefaults`, `FileTimestamp`; no tracking). Verify via Xcode's Privacy Report before each submission.

## Support

- Email: support@mayutic.com
- Issues: https://gitlab.com/mayutic/ration/application/-/issues

## Permissions

| Key | Purpose |
|-----|---------|
| `NSCameraUsageDescription` | Receipt scanning |
| `NSPhotoLibraryUsageDescription` | Import receipt photos when camera unavailable |
| `NSUserNotificationsUsageDescription` | Optional expiration/meal reminders |

## Device

- **iPhone only** (portrait). No iPad-optimized layout in v1.

## Sandbox Checklist

- [ ] Magic link sign-in on physical device
- [ ] Crew Member subscription purchase + restore
- [ ] Credit pack purchase credits ledger update via RC webhook
- [ ] Receipt scan → review → confirm to Cargo
- [ ] Account deletion end-to-end
- [ ] Forced-logout wipe: sign in, populate Cargo/Galley snapshots and an org avatar, force a 401 (revoke the refresh token server-side or simulate via a debug hook), confirm the app signs out; then confirm no cached snapshot data or images render before the next sign-in completes, and that a different account signing in on the same device sees no trace of the previous account's cached data
