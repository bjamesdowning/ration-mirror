# App Review Notes (Ration iOS)

Use this document when submitting to App Review or TestFlight external testing.

## Login

- **Method:** Magic link email with PKCE.
- **Handoff (primary):** Universal Link `https://ration.mayutic.com/auth/mobile-callback/open?code=…` (Associated Domains `applinks:ration.mayutic.com`). A user tap on the "Open Ration" page button opens the app directly.
- **Handoff (fallback):** Custom URL scheme `ration://auth/callback?code=…`, used only if Universal Links don't fire (app not installed, AASA not yet cached). The code is a single-use, PKCE-bound UUID with a ~60s TTL.
- **Demo account:** App Review needs a dedicated inbox that actually receives magic-link emails (no password flow exists to bypass this). Provision a real mailbox — e.g. `app-review@mayutic.com` (or a shared alias forwarding to it) — *before* submission, add it as a user in production, and note the exact email in the App Store Connect "Notes for Review" field along with: "Sign-in is passwordless (magic link only); tap **Sign in**, enter the email above, and open the link delivered to that inbox." If App Review's automation cannot click an emailed link, request a temporary pre-authenticated TestFlight build instead (Settings → note the org/session state expected) rather than leaving this inbox undocumented — an inbox nobody monitors during the review window is a guaranteed rejection on the login step. **Status: not yet provisioned — operator action required before submission.**

### Universal Links operator checklist

- [ ] **Blocked — CR-2 (production AASA 404), operator action required, not resolvable by the coding agent:** `curl -si https://ration.mayutic.com/.well-known/apple-app-site-association` was re-verified on 2026-07-01 and still returns `HTTP/2 404` with **no `Content-Type` header** and `Content-Length: 0`, while the sibling route `https://ration.mayutic.com/.well-known/api-catalog` returns `200` with a correct `Content-Type` on the same deployed Worker — confirming the app code/deploy is not the cause (see `plans/ios-security-audit-fix-plan.md` §0/CR-2). The most likely cause is a Cloudflare **zone-level Rule** (Redirect/Configuration/legacy Page Rule) matching this literal path. **Requires Cloudflare Dashboard → Rules access** (zone-scoped; the `wrangler` session available to the coding agent is account/Workers-scoped only and cannot enumerate or mutate zone Rules). Do not attempt physical-device Universal Link testing or final submission until this returns `200` with `content-type: application/json` and a body containing `applinks.details[0].appID == "M2KJH5GDGH.com.mayutic.ration"` and `paths == ["/auth/mobile-callback/open"]`.
- [ ] After the above returns `200`: separately verify Apple's CDN view has propagated — `curl -s https://app-site-association.cdn-apple.com/a/v1/ration.mayutic.com` — allowing for normal CDN propagation lag before treating a stale/empty result as a new bug.
- [ ] App is signed with a provisioning profile that includes the **Associated Domains** capability.
- [ ] On a physical device, tapping the magic-link "Open Ration" button opens the app (not Safari). **Not yet re-run since this checklist was last verified — re-run after the AASA fix above lands**, using the production entitlement (`applinks:ration.mayutic.com`, no `?mode=developer`).
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
