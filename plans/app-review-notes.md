# App Review Notes (Ration iOS)

Use this document when submitting to App Review or TestFlight external testing.

## Login

- **Method:** Magic link email with PKCE.
- **Handoff (primary):** Universal Link `https://ration.mayutic.com/auth/mobile-callback/open?code=…` (Associated Domains `applinks:ration.mayutic.com`). A user tap on the "Open Ration" page button opens the app directly.
- **Handoff (fallback):** Custom URL scheme `ration://auth/callback?code=…`, used only if Universal Links don't fire (app not installed, AASA not yet cached). The code is a single-use, PKCE-bound UUID with a ~60s TTL.
- **Demo account:** Provide App Review with a dedicated test email that receives magic links, or supply a pre-authenticated TestFlight build note with step-by-step login.

### Universal Links operator checklist

- [ ] `https://ration.mayutic.com/.well-known/apple-app-site-association` returns JSON (no redirect, `Content-Type: application/json`) with appID `M2KJH5GDGH.com.mayutic.ration`.
- [ ] App is signed with a provisioning profile that includes the **Associated Domains** capability.
- [ ] On a physical device, tapping the magic-link "Open Ration" button opens the app (not Safari).
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

- First receipt scan shows **AI Processing & Receipt Privacy** consent.
- Consent state: Settings → Privacy & AI.
- Privacy policy: https://ration.mayutic.com/legal/privacy
- Terms: https://ration.mayutic.com/legal/terms

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
