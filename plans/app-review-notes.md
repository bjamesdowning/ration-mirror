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

1. **Seed** (idempotent, local-only script under gitignored `scripts/seed-account/`): `bun scripts/seed-account/seed-app-review-demo.ts --remote` then set Wrangler secrets `APP_REVIEW_DEMO_EMAIL` (`app-review@mayutic.com`), `APP_REVIEW_DEMO_PASSWORD`, `APP_REVIEW_DEMO_USER_ID`.
2. **Flagship:** create boolean flag `app-review-login` (default off). **Enable before** submitting / replying to review; **disable after** approval or between review windows (no redeploy). Emergency: `FEATURE_FLAG_OVERRIDES` `{"app-review-login":false}`.
3. **App Store Connect** → TestFlight → Test Information → Beta App Review Information → check **Sign-in required** → User Name `app-review@mayutic.com` / Password = secret.
4. **Notes for Review** (paste):

```text
Sign-in: On Sign In, type the User Name (app-review@mayutic.com) in Email.
A Password field then appears. Enter the Password from Review Information
and tap Sign in. Do not use Sign in with Apple / Google.
No 2FA. Account is pre-seeded (Cargo, Galley, Manifest, Supply).
Account: profile button (top right of each tab) opens the Account sheet.
Account deletion: Account → Delete account → type delete → Delete my account.
Subscriptions and credits (Apple IAP): Account → Upgrade to Crew Member.
Restore purchases and Manage subscription are on that screen.
Cancelled Crew stays Active until the period ends; delete unlocks after cancel.
AI features (scan, meal generation, recipe import, Plan week, Ask Ration)
first ask "Allow AI features?", naming Google Gemini (via Cloudflare AI
Gateway) and Supadata. Change it any time: Account → Feature enablement.
Macros (planning aids, not medical advice): Account → Nutrition Goals;
Manifest → Log my serving; Manifest chart button (top left) → Macros.
Macro Tracking is opt-in under Feature enablement.
Supply: Live Supply is the shopping list. Saved lists are under the
bottom-right Supply actions menu → Lists.
Home Screen widgets (Supply, Eat, Today) need no extra permissions.
Backend: https://ration.mayutic.com — live, no VPN.
```

5. Reply in the Resolution Center that credentials are filled and the account is ready.

**UX:** The Password field appears when the email field equals `app-review@mayutic.com`. `POST /api/mobile/v1/auth/review-login` still rejects the login unless Flagship `app-review-login` is on, so keep it on for the whole review window.

### Universal Links operator checklist

- [x] **CR-2 (production AASA):** Fixed in v1.4.48 — Worker allow-list omission. Verified 2026-07-06: origin and Apple CDN return `200` with `appID: M2KJH5GDGH.com.mayutic.ration` and `paths: ["/auth/mobile-callback/open"]`.
- [x] Apple CDN propagated — verified 2026-07-06 via `curl -si https://app-site-association.cdn-apple.com/a/v1/ration.mayutic.com`.
- [ ] App is signed with a provisioning profile that includes the **Associated Domains** capability.
- [ ] On a physical device, tapping the magic-link "Open Ration" button opens the app (not Safari). Re-run with production entitlement (`applinks:ration.mayutic.com`, no `?mode=developer`) — AASA origin and Apple CDN verified 2026-07-06.
- [ ] Custom-scheme fallback still completes sign-in when Universal Links are unavailable.

## In-App Purchases

- **Subscriptions:** Crew Member via RevenueCat / App Store (`crew_monthly` = monthly subscription, `crew_annual_1yr` = annual subscription; legacy id `crew_annual` still mapped in the iOS catalog).
- **Consumables:** Credit packs (`credits_s`, `credits_m`, `credits_l`, `credits_xl`) via RevenueCat consumable products.
- **Restore:** Always available on the paywall (Account → **Upgrade to Crew Member** or **Manage billing**), including for active Crew.
- **Manage / cancel (App Store):** Paywall **Manage subscription** opens Apple’s `showManageSubscriptions` sheet. Do not cancel Apple billing from Ration’s servers.
- **Cancel-at-period-end:** After Apple cancel, Crew remains Active until the period end date. Ration reconciles cancel-at-period-end from RevenueCat REST (and webhooks) so account deletion unlocks once the sub is set to end.
- **Web Stripe:** Existing Stripe subscriptions are honored as account entitlements but new purchases on iOS use Apple IAP only. Paywall may show manage-on-web copy for an existing Stripe sub (not a purchase CTA). Help must not link to web billing.
- **Metadata (3.1.2):** App Description must include a functional Terms of Use (EULA) link (and Privacy). Standard Apple EULA + Description footer — already configured in ASC; mirrored in `marketing/appstore/uk/COPY.md`.

### Demo account tier (paywall visibility)

Before each App Review window, confirm `app-review@mayutic.com` (`d773eefb-e112-4b75-abe2-066584cd3c1d`) is **Free** (not Crew) so reviewers see subscribe packages. Re-seed with `bun scripts/seed-account/seed-app-review-demo.ts --remote` (always forces Free; keeps credits + sample data). No RevenueCat entitlement is expected for this DB-granted demo path.

## Account Deletion

- Path: profile button → **Account** → **Delete account** → type `delete` → **Delete my account**.
- On success the app shows **Account deletion started** and signs out; sign-in stays blocked until removal finishes.
- Permanently removes inventory, meals, supply lists, meal plans, scans, Copilot conversations, API keys, sessions, and OAuth grants.
- Blocked while an Apple subscription auto-renews (the screen offers **Manage Subscription**); allowed after cancel-at-period-end (with warning) or when Free.

## AI / Privacy

- **Allow AI features?** names **Google Gemini (via Cloudflare AI Gateway)** and **Supadata** (recipe imports), and covers scan, meal generation, recipe import, Plan week, and Ask Ration. Accept once; withdraw any time in Account → **Feature enablement** (re-prompts before the next AI use).
- Server enforces consent on scan / generate / import / plan-week (403 `ai_consent_required`). Mobile Ask/Copilot WebSocket also returns 403 `ai_consent_required` when consent is missing.
- Privacy policy: https://ration.mayutic.com/legal/privacy
- Terms: https://ration.mayutic.com/legal/terms
- `PrivacyInfo.xcprivacy` declares collected types including **Health** (App Functionality, not tracking). ASC Health & Fitness has only **Health** vs **Fitness** — declare **Health** only (not Fitness). That single type covers allergens/dietary prefs and optional nutrition goals/private intake; ASC has no allergen/macro subtypes.

### ASC App Privacy Nutrition (operator)

Declare **Health**: linked to the user, used for App Functionality, **not** used for tracking. Do **not** declare Fitness. Align ASC with the binary PrivacyInfo Health entry. Detail (allergens vs goals/intake) belongs in the privacy policy, not ASC subtypes.

### Shipped on iOS 1.5.x

Every flagged iOS feature (AI, Ask Ration, nutrition, Macros, saved lists, widgets) is on for iOS ≥ 1.5.0 without Flagship rules (`iosAlwaysOn` in `app/lib/feature-flags/registry.ts`). Only `app-review-login` still needs a Flagship toggle for review. Emergency kill switch: `FEATURE_FLAG_OVERRIDES` (applies to every platform).

### Update required (minimum iOS version)

The Worker returns `426 upgrade_required` to iOS builds below `IOS_MIN_SUPPORTED_VERSION` (`wrangler.jsonc`). iOS 1.5.11+ shows a full-screen **Update Ration** screen with **Open the App Store**. Session, settings, account (deletion), and auth routes stay open so an old build can still sign out and delete the account. Keep the floor at the current App Store build during review; raise it only after the new build is Ready for Sale.

## Support

- Email: support@mayutic.com
- Issues: https://gitlab.com/mayutic/ration/application/-/issues

## Permissions

| Key | Purpose |
|-----|---------|
| `NSCameraUsageDescription` | Receipt scanning |
| `NSPhotoLibraryUsageDescription` | Receipt/pantry photos, Supply imports, profile/group images |

Home Screen widgets read an App Group snapshot written by the app; they need no permission prompt.

## Device

- **iPhone only** (portrait), iOS 26 or later. No iPad-optimized layout.

## Before each App Review / TestFlight review window

1. [ ] Re-seed or confirm demo user is **Free**: `bun scripts/seed-account/seed-app-review-demo.ts --remote` (user `d773eefb-e112-4b75-abe2-066584cd3c1d`)
2. [ ] Flagship `app-review-login` **enabled**; `IOS_MIN_SUPPORTED_VERSION` is not above the build under review
3. [ ] ASC Review Information password matches `APP_REVIEW_DEMO_PASSWORD`
4. [ ] On device: Sign In with demo email → password → Account → **Upgrade to Crew Member** shows the packages + **Restore purchases** + Terms of Use / Privacy
5. [ ] Sandbox: offerings load; one purchase + Restore; cancel → paywall shows Active until date / Delete Account unlocks
6. [ ] ASC App Privacy: Health declared (Linked, App Functionality, not tracking; not Fitness); Description EULA/Terms/Privacy footer present; Support + Privacy URLs live
7. [ ] RevenueCat: App Store Server Notifications enabled (reduces cancel webhook lag)
8. [ ] Upload new binary when paywall/consent/plist changed
9. [ ] After approval: disable `app-review-login`

## Sandbox Checklist

- [ ] Magic link sign-in on physical device
- [ ] Crew Member subscription purchase + restore
- [ ] Cancel subscription → status shows Active until period end; Delete Account allowed after cancel-at-period-end sync
- [ ] Credit pack purchase credits ledger update via RC webhook
- [ ] Receipt scan → review → confirm to Cargo
- [ ] Account deletion end-to-end
- [ ] Forced-logout wipe: sign in, populate Cargo/Galley snapshots and an org avatar, force a 401 (revoke the refresh token server-side or simulate via a debug hook), confirm the app signs out; then confirm no cached snapshot data or images render before the next sign-in completes, and that a different account signing in on the same device sees no trace of the previous account's cached data
