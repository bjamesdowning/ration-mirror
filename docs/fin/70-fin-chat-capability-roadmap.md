# Fin chat: capability rollout (roadmap)

Internal sequencing for **Intercom Fin** data connectors after billing **cancel at period end** and **resume** are live. Each item should reuse the same security model: shared connector secret, **`user_id` only** from the verified contact (never client-supplied Stripe IDs), tight rate limits on writes, and minimal JSON safe for support.

## Shipped (baseline)

1. **Billing read** — `GET /api/fin/billing-summary?user_id=…`
2. **Cancel at period end** — `POST /api/fin/subscription-cancel` with `{ "user_id", "confirm": true }`
3. **Resume renewal** — `POST /api/fin/subscription-resume` with the same body

## Recommended next (by value vs risk)

1. **Credit balance (org)** — read-only connector: current AI credits for the user’s **active organization** (same rules as in-app display; no ledger PII).
2. **Group / tier context** — read-only: active org name, whether the user is owner/admin/member, and whether the **owner’s** tier explains invite/share gates (no enumeration of other users’ emails).
3. **Deep-link help** — read-only or static: return canonical paths (`/hub/settings`, `/hub/pricing`, etc.) for “where do I …?” questions; keep answers aligned with [INDEX.md](./INDEX.md) articles.
4. **Ledger summary (optional)** — read-only recent credit movements for support debugging; requires strict field allowlisting and privacy review.
5. **Invoice / payment failure narrative (optional)** — Stripe-safe fields only; legal/support review before enabling.

## Principles

- **App wins** over Fin copy: if the product changes, update articles and connectors first.
- **No Fin writes** beyond the explicitly reviewed mutation endpoints.
- **Rate limit** every connector; writes stricter than reads.
