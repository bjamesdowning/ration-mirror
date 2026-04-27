# Plan: Extend Intercom Messenger JWT with signed user attributes

Goal: Enrich the JWT we pass to the Intercom Messenger so Fin can personalize replies (tier, billing posture, etc.) **without** calling a data connector for static-ish facts. Connectors stay reserved for live, mutating reads (e.g. Stripe billing summary) and for writing back changes that should propagate on the next sign-in via a freshly-signed JWT.

---

## 1. Audit of current Intercom integration

### Where the messenger is initialized
- `app/lib/intercom.server.ts:27` — `signIntercomJwt(userId, email, companyId, secret, options)` produces an HS256 JWT with payload `{ user_id, email?, company_id?, exp }`. Header is fixed `{ alg: "HS256", typ: "JWT" }`. `exp` is `now + 300`.
- `app/root.tsx:49-58` — root loader signs the JWT for any authenticated user when both `INTERCOM_MESSENGER_JWT_SECRET` and `session.user.id` are present, then ships `intercomAppId`, `intercomUserJwt`, `activeOrganizationId` (+ `user`) to clients.
- `app/components/support/HubIntercom.tsx:62-78` — boots `@intercom/messenger-js-sdk` only inside `/hub/*`. Sends `app_id`, `user_id`, `name`, `email`, optional `created_at`, `intercom_user_jwt`, optional `company.company_id`, and **plain (unsigned) `custom_attributes`**: `ration_tier`, `ration_tier_expired`, `ration_credit_balance` (sourced from the hub loader at `app/routes/hub.tsx:139-167`). Calls `shutdown()` on unmount and on remount.
- `app/components/support/IntercomLauncherButton.tsx` — header trigger using `custom_launcher_selector`. Hidden default bubble via `app/lib/intercom-hub-settings.ts:11-18`.
- `app/lib/intercom-launcher-context.tsx` — local React context for unread badge state.

### Server endpoints that already exist for Fin
All three are connector endpoints, gated by a shared bearer secret `FIN_INTERCOM_CONNECTOR_SECRET` (`app/lib/fin-connector.server.ts:18-42`, constant-time compare) and per-user KV rate limiting:
- `GET  /api/fin/billing-summary` — Stripe subscription + invoice preview (live data).
- `POST /api/fin/subscription-cancel` — sets `cancel_at_period_end=true`, persists to D1, idempotent via Stripe key (`app/lib/fin-billing.server.ts:304-498`).
- `POST /api/fin/subscription-resume` — symmetric.

### Source-of-truth fields in D1 (`schema.user`, `app/db/schema.ts:16-50`)
- `tier` (text, default `"free"`; values `"free" | "crew_member"`) — **canonical naming**; DO NOT abbreviate to `"crew"` (per request).
- `tierExpiresAt` (timestamp | null).
- `crewSubscribedAt` (timestamp | null).
- `welcomeVoucherRedeemed` (boolean).
- `stripeCustomerId` (text | null) — already exposed to Fin via billing summary.
- `subscriptionCancelAtPeriodEnd` (boolean).
- `tosAcceptedAt`, `tosVersion`.
- `isAdmin` (boolean).

Type slug definition lives at `app/lib/tiers.server.ts:1` (`type TierSlug = "free" | "crew_member"`). The `getEffectiveTier()` helper at `app/lib/capacity.server.ts:40-55` already derives "expired" semantics — must reuse it so JWT tier matches the rest of the app.

### Current trust boundary
Intercom Messenger Security treats attributes set via the JS messenger object as **unsigned** and treats attributes in the signed JWT as **trusted**. Today, `ration_tier` and `ration_credit_balance` are passed as **plain JS attributes** — meaning a user with devtools can spoof them in the messenger boot call. This works for personalization but not for any Fin workflow that gates behavior on tier (e.g. "do not offer a discount to crew_member"). Moving these into the JWT closes that gap.

### Cookies / CSP
Existing CSP in `app/root.tsx:71-84` covers Intercom domains; no CSP changes needed. Privacy disclosure already mentions Intercom (`app/routes/legal.privacy.tsx:135-148, 295-310, 466-472`); we will need to add the new attribute categories to that disclosure.

---

## 2. Required additions (per the request)

| Attribute | Source | DB column | JWT key | Type | Notes |
|---|---|---|---|---|---|
| Plan tier | `schema.user.tier` | `tier` | `tier` | string | Use **DB-native values** `"free"` / `"crew_member"`. Apply `getEffectiveTier()` so an expired `crew_member` projects as `"free"` in Intercom too — matches the rest of the app. |
| Stripe customer | `schema.user.stripeCustomerId` | `stripe_customer_id` | `stripe_customer_id` | string \| null | Allowed null for free users / never-paid users. |

### Suggested additional attributes (high value, low risk)
All of these are already in D1 and are useful for Fin workflows / segmentation. Sending them in the **signed** JWT means Fin trusts them without a connector call.

| Attribute | JWT key | Why useful |
|---|---|---|
| Effective tier expiry | `tier_expires_at` | Lets Fin warn "your Crew expires in 3 days" without a connector call. Unix seconds; `null` for free. |
| Tier expired | `tier_expired` | Already passed unsigned today; mirrors `getEffectiveTier().isExpired`. Fin can phrase win-back messages. |
| Subscription cancel scheduled | `subscription_cancel_at_period_end` | Drives the "you're scheduled to cancel — want to resume?" workflow without hitting Stripe. |
| First-paid date | `crew_subscribed_at` | Tenure/loyalty segmentation. Unix seconds. |
| Welcome voucher redeemed | `welcome_voucher_redeemed` | Avoid re-offering WELCOME65. |
| Admin | `is_admin` | Distinct tone / fewer guardrails for internal users. |
| Active org id | `company_id` *(existing)* | Already used; keep. |
| Active org role | `org_role` | "owner" / "admin" / "member" — gates billing answers ("only the owner can change the plan"). Pulled from `member` table for the `activeOrganizationId`. |
| Credit balance | `credit_balance` | Already passed unsigned; move to signed and round to integer. |
| TOS version current | `tos_version` | Lets a workflow prompt a re-accept when the active TOS version moves. |
| Locale / theme | `locale`, `theme` | Lets Fin reply in the right tone (light/dark UI cue and any future i18n). |

**Out of scope** (do *not* sign): live Stripe state (next payment date, amount due, plan name) — those still belong in `/api/fin/billing-summary` because they mutate independently of our DB and a 5-minute JWT would go stale fast.

---

## 3. Refresh model (the "update via connector, re-sign on next sign-in" flow)

The user described the desired loop. It already works for `subscriptionCancelAtPeriodEnd` (Fin connector → D1 update → next page load re-signs JWT). We will preserve this pattern:

1. **Read path.** Every authenticated page render re-runs the root loader, re-reads the user row, and re-signs a fresh JWT (`exp = now + 300`). So as soon as a user navigates after a tier change, Intercom sees the new value.
2. **Mutation path.** When Fin invokes a connector that mutates state (cancel/resume today, future endpoints later), the connector writes D1 + invalidates the tier KV cache (`invalidateTierCache`, `app/lib/capacity.server.ts:70-79`). No write-back to Intercom is needed; the next JWT carries the new value.
3. **Active-session refresh (optional, see §6).** Within a single open messenger session, the JS SDK retains attributes from boot. Two options:
   - **Default**: do nothing — next route navigation re-boots the messenger with a fresh JWT (the existing `useEffect` in `HubIntercom.tsx:48-113` already keys on `hub.tier` and `hub.balance` and reboots).
   - **Optional**: add a tiny `/api/intercom/refresh-jwt` endpoint that re-signs and returns a JWT, then call `Intercom('update', { intercom_user_jwt: <new>, ...attrs })`. Recommended only if we see staleness in practice.

---

## 4. Implementation plan

### Step 1 — Define the signed payload schema
In `app/lib/intercom.server.ts`:

- Replace the positional `signIntercomJwt(userId, email, companyId, secret, options)` with a single options-object signature:
  ```ts
  signIntercomJwt({
    userId, email, companyId, secret,
    attributes,           // typed object (see below), all optional
    nowSeconds?,
  })
  ```
- Define a `SignedIntercomAttributes` type that whitelists exactly which keys may be added to the payload. Anything not in the allowlist is rejected — prevents accidental PII spillage.
- Apply length caps (e.g. ≤ 128 chars) and type guards before serializing. Keep the function pure and edge-runtime safe (Web Crypto).
- Keep `exp = now + 300`. Add `iat = now` for completeness (Intercom ignores it but it makes audit logs more useful).

### Step 2 — Centralize attribute computation
Add `app/lib/intercom-attributes.server.ts`:

```ts
export async function buildIntercomSignedAttributes(env, db, session, activeOrganizationId)
  -> { attributes: SignedIntercomAttributes; webAttributes: Record<string, unknown> }
```

This module:
- Reads the *minimum* extra columns from `user` and `member` not already in `session.user` (one query, e.g. `stripeCustomerId`, `subscriptionCancelAtPeriodEnd`, `crewSubscribedAt`, `welcomeVoucherRedeemed`, `isAdmin`).
- Calls `getEffectiveTier(rawTier, tierExpiresAt)` so JWT tier === app tier.
- Looks up `member.role` for the `activeOrganizationId` (already loaded by `requireActiveGroup` for hub routes).
- Returns:
  - `attributes`: the JWT-signed set (string/number/boolean primitives only; no nested objects).
  - `webAttributes`: a strict subset that is safe/useful to also pass via the JS SDK boot (e.g. `name`, `created_at`) — i.e. anything the messenger needs *before* JWT is parsed. Tier/balance/etc. are **dropped** from the JS object now that they live in the JWT.

Reusing this helper from both `root.tsx` (read path) and any future `/api/intercom/refresh-jwt` (active-session refresh) keeps the projection in one place.

### Step 3 — Wire into the root loader
In `app/root.tsx:27-69`:
- Add a single `db.query.user.findFirst(...)` call (gated on `session?.user?.id && jwtSecret && intercomAppId` — skip the query entirely when Intercom is disabled to avoid a wasted D1 read on every page load).
- Pass the resulting attribute set to `signIntercomJwt`.
- Return a new `intercomCustomAttributes: webAttributes` field alongside `intercomUserJwt` for consumption by `HubIntercom`.

### Step 4 — Rewrite the messenger boot
In `app/components/support/HubIntercom.tsx:62-78`:
- Remove the unsigned `custom_attributes` block (tier / tier_expired / credit_balance) — these now ride in the JWT and Intercom will trust the JWT version (per Intercom's docs, JWT values override JS-set values when both are present). Keeping both in sync is error-prone; the JWT becomes the source of truth.
- Drop the `hub: HubIntercomContext` prop entirely. The hub layout no longer needs to pass tier/balance into the messenger; the JWT carries them. This simplifies `HubIntercom`'s effect-deps array and removes the re-boot churn whenever balance changes.
- The boot keys (`user_id`, `name`, `email`, `created_at`, `company.company_id`, `intercom_user_jwt`) remain in the JS object because the messenger needs them at boot time and the JWT confirms them.

`app/routes/hub.tsx` keeps fetching tier/balance for *its own UI* but stops forwarding them to `HubIntercomFromRoot`.

### Step 5 — Configure Intercom workspace
*(Operational, not code — but required for Fin to actually use the new attributes.)*
- In Intercom dashboard, define the new keys as **Custom Data Attributes (User)** with matching types:
  - `tier` (string), `tier_expires_at` (date), `tier_expired` (boolean), `stripe_customer_id` (string), `subscription_cancel_at_period_end` (boolean), `crew_subscribed_at` (date), `welcome_voucher_redeemed` (boolean), `is_admin` (boolean), `org_role` (string), `credit_balance` (integer), `tos_version` (string), `locale` (string), `theme` (string).
- In **Messenger → Security**, set "Identity verification" to **Enforce on web** (if not already). This is what makes JWT-signed attributes the trusted source.
- Set Fin's workflow conditions to read from these CDAs instead of calling the billing connector for tier checks.

### Step 6 — Update the privacy policy
Edit `app/routes/legal.privacy.tsx:295-310` to enumerate the new attributes shared with Intercom (tier, tier expiry, billing identifiers, role, etc.). This is a GDPR-relevant change.

### Step 7 — Tests
Extend `app/lib/__tests__/intercom.server.test.ts`:
- Round-trip: sign → verify → parsed payload contains all expected attribute keys with correct types.
- Allowlist: passing a non-allowed key throws / is dropped.
- Expired-tier projection: `tier="crew_member"` + past `tierExpiresAt` ⇒ JWT carries `tier="free"` and `tier_expired=true`.
- Null/empty handling: `stripe_customer_id` omitted (not `""`) when the user has none.
- Length cap: oversize string is rejected.

Add `app/lib/__tests__/intercom-attributes.server.test.ts`:
- Build helper returns expected shape from a fixture user/member row.
- Honors `getEffectiveTier`.
- Skips DB read when no Intercom secret is configured (verified by mocking `db.query.user.findFirst` and asserting it's not called).

### Step 8 — Optional: active-session refresh endpoint
Defer until needed. If we add it: `app/routes/api/intercom.refresh-jwt.ts` — POST, requires Better Auth session, returns `{ jwt, attributes }`. The hub shell calls this on visibility change after >4 minutes, then `Intercom('update', { intercom_user_jwt: jwt, ...attrs })`.

---

## 5. Security analysis

| Risk | Mitigation |
|---|---|
| JWT secret leaks | Already a Cloudflare secret (`INTERCOM_MESSENGER_JWT_SECRET`), never returned to client, signed on the worker. No change. |
| PII over-share | Allowlist in `signIntercomJwt` rejects any key not in the schema. No raw email content, no IP, no payment method data. |
| JWT readable by attacker | JWT is base64, not encrypted — assume the attacker reads it. Nothing in the proposed payload is sensitive on its own (tier, role, stripe customer id which Stripe already considers a non-secret identifier). |
| Spoofed attributes from JS | Resolved by moving tier/balance/etc. into the **signed** JWT. Intercom enforces JWT identity verification. |
| Stale JWT after a tier change | Acceptable: `exp = 300s`, and every navigation re-signs from current D1. Tier KV is invalidated on Stripe webhook, so the next loader read sees fresh data. |
| Replay across users | JWT binds `user_id` and is HS256 with a per-environment secret. Replay only works within `exp` window for the same user — same as today. |
| Larger JWT inflates request size | Adding ~10 short fields ≈ +200 bytes base64. Negligible on Cloudflare. |
| Connector bypass | Connector secret (`FIN_INTERCOM_CONNECTOR_SECRET`) plus rate limiter unchanged. Mutation paths still go through the connector — JWT is read-only signal. |
| KV cache poisoning | Tier cache key is `tier:${organizationId}`, value is server-written only via `getGroupTierLimits`. Not user-writable. No change. |
| New `/api/intercom/refresh-jwt` (if added in Step 8) | Requires Better Auth session, returns nothing the user couldn't infer about themselves, rate limited per-user via existing `checkRateLimit`. |

No changes needed to: CSP (already covers Intercom), CORS (loader is same-origin), session cookies, or Stripe webhook flow.

---

## 6. Rollout

1. Land Steps 1-4 + 7 behind the existing `INTERCOM_MESSENGER_JWT_SECRET` env gate. If the secret is unset, `signIntercomJwt` returns `null` and the messenger boots unauthenticated (today's behavior — no regression).
2. In a non-prod Intercom workspace: define the CDAs (Step 5), open the messenger, inspect the user record in Intercom to confirm attributes arrive with correct types.
3. Update Fin workflows to read CDAs instead of billing connector for tier-gated branches.
4. Push privacy-policy update (Step 6) before flipping production traffic.
5. Promote to prod. Watch Intercom event volume + connector call volume — connector call volume should drop for tier-only checks.

## 7. Out of scope / explicitly deferred
- Server-side push to Intercom REST API (`POST /contacts/{id}`) — not needed; JWT-on-next-load covers it.
- Encrypting JWT payload (JWE) — adds complexity, no current threat that requires it.
- Per-attribute consent gating — current privacy policy already discloses Intercom data sharing in aggregate.
- Migrating `intercom_user_jwt` issuance off the root loader into a dedicated endpoint — possible future optimization to avoid the extra D1 read on every render for users who never open the messenger (would require a client fetch on messenger boot).
