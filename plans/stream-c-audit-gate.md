# Stream C Audit Gate — iOS Pre-TestFlight

Date: 2026-06-29
Version: 1.3.44

## Gate Decision

**Code readiness:** Pass after the P0 fixes in this audit.

**TestFlight readiness:** Conditional pass. The codebase is ready for an internal TestFlight build once the remaining operator-owned configuration items are completed:

- Set `DEVELOPMENT_TEAM` in `ios/project.yml`, then run `bun run ios:generate`.
- Set the RevenueCat Apple public SDK key (`appl_...`) for `RevenueCatPublicAPIKey`; never use `sk_`, `strp_`, Stripe, Better Auth, or `.p8` secrets in the app.
- Configure App Store Connect products and RevenueCat products, entitlement, and current offering.
- Configure the RevenueCat webhook to production and deploy required Worker secrets.
- Sandbox-test purchase and restore before enabling `REVENUECAT_FULFILLMENT_ENABLED=true`.
- ~~Replace the AASA `TEAMID` placeholder and add Associated Domains when moving from custom-scheme auth to Universal Links.~~ **Done (v1.3.46):** AASA serves the real appID `M2KJH5GDGH.com.mayutic.ration`, the iOS app declares `applinks:ration.mayutic.com`, the auth handoff uses a Universal Link as primary with the custom scheme as fallback. Operator step remaining: ensure the signing provisioning profile includes the Associated Domains capability and verify on a physical device (see `plans/app-review-notes.md`).

## Audit Scope

- Native SwiftUI client under `ios/Ration/`
- Mobile Bearer API under `app/routes/api/mobile/v1.*`
- Mobile auth callback and PKCE code exchange
- RevenueCat billing boundary, webhook assumptions, and entitlement mapping
- Scan upload/status polling, Cargo/Galley/Supply mobile contracts
- QA/devops scripts for XcodeGen and XCTest

## Findings Fixed

### Security & Privacy

- Mobile auth code exchange remains PKCE-protected. The custom `ration://` scheme is acceptable for MVP because intercepted codes cannot be exchanged without the Keychain-held verifier.
- Sign-out now refreshes an access token when needed before calling server-side session revoke, reducing stale refresh-token families.
- RevenueCat state is reset on sign-out via `BillingManager.logOut()`.
- iOS paywall now includes auto-renewal disclosure and Terms/Privacy links.
- Privacy Policy now covers RevenueCat and Apple App Store purchase processing.
- Terms now cover Stripe web purchases and Apple iOS subscriptions.

### Billing

- Purchase and restore remain fail-closed unless RevenueCat is configured and logged in as the Ration `user.id`.
- Offerings are cleared when RevenueCat login is missing or fails, preventing stale anonymous purchase options.

### Reliability & Scalability

- iOS API transport now uses an ephemeral `URLSession`, disables URL cache, and sets `reloadIgnoringLocalCacheData`.
- iOS API transport retries authenticated GETs once on 429/503, honoring `Retry-After` when provided.
- iOS scan polling now aligns with the web scan timeout window (~120 seconds instead of ~20 seconds).
- `GET /api/mobile/v1/meals` now uses a read bucket (`meal_list`) instead of the mutation limiter.
- `CapacityExceededError` now returns structured 403 details instead of a generic 500.

## Residual Non-Blocking Risks

- Scan results are displayed but not yet confirmed into Cargo via `/api/mobile/v1/cargo/batch`. This is acceptable for internal MVP testing but should be completed before making Scan a headline TestFlight claim.
- Galley and Supply mobile payloads are not yet cursor-paginated/slimmed. Fine for small test orgs; revisit before broad beta.
- Offline persistence is not implemented in the native app. The web PWA remains the offline-first surface for now.
- Universal Links are the primary auth handoff as of v1.3.46 (AASA + Associated Domains shipped); the PKCE-bound custom scheme remains as a fallback only. Activation still depends on signing the build with a profile that carries the Associated Domains capability.

## Required Verification

Before TestFlight upload:

- `bun run lint`
- `bun run typecheck`
- `bun run test:unit`
- `bun run ios:check`
- Production `bun run db:migrate:prod`
- Production deploy containing the mobile API and RevenueCat webhook code
- Manual sandbox run: magic-link sign-in, Cargo list/create/delete, Supply toggle, Galley browse/detail, Scan upload/status, RevenueCat purchase, restore, webhook fulfillment, Settings tier refresh

## RevenueCat / App Store Sandbox Checklist

1. App Store Connect: bundle ID `com.mayutic.ration`, subscriptions/consumables, sandbox testers.
2. RevenueCat: Apple app linked, IAP `.p8` key uploaded, products mapped, entitlement `crew_member`, current offering configured.
3. Cloudflare: `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, and Stripe sync key where needed.
4. iOS build: `RevenueCatPublicAPIKey` set to the Apple public SDK key.
5. Purchase: verify Apple sandbox transaction appears in RevenueCat under `app_user_id == Ration user.id`.
6. Webhook: verify RC webhook returns 200 and idempotency key is written.
7. Fulfillment: enable `REVENUECAT_FULFILLMENT_ENABLED=true` only after sandbox grant/revoke behavior is verified.
