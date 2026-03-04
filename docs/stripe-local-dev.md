# Stripe Local Dev Setup

For the WELCOME65 one-time-per-customer coupon (Supply Run only) to work locally, webhooks must reach your dev server and `STRIPE_WEBHOOK_SECRET` must match the Stripe CLI.

## 1. Start Stripe CLI

In a **separate terminal**, run:

```bash
stripe listen --forward-to localhost:5173/api/webhook
```

**Important:** The path is `/api/webhook` (singular), not `/api/webhooks` or `/api/webhooks/stripe`. Using the wrong path returns 404 and webhooks never reach the app.

The CLI will print a webhook signing secret, e.g.:

```
Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (^C to quit)
```

## 2. Update .dev.vars

Copy the secret from the CLI output and set it in `.dev.vars`:

```
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Important:** The secret changes every time you restart `stripe listen`. You must update `.dev.vars` and restart `bun run dev` whenever you restart the CLI.

## 3. Restart the dev server

After changing `.dev.vars`, restart the dev server so it loads the new secret:

```bash
# Stop bun run dev (Ctrl+C), then:
bun run dev
```

## 4. Verify webhooks are working

When you complete a Supply Run checkout with WELCOME65 (valid for Supply Run only):

1. **Stripe CLI terminal** — You should see `checkout.session.completed` events.
2. **Dev server terminal** — You should see `[INFO] Stripe webhook received` and `[INFO] Added credits from checkout`.

If you don’t see these logs, the webhook is not reaching or verifying correctly.

## 5. Troubleshooting 500 errors

If the Stripe CLI shows **500** for webhook requests:

1. **Check the dev server terminal** (the one running `bun run dev`). The real error and stack trace are logged there as `[ERROR] Webhook processing failed`. The Stripe CLI only shows the HTTP status.
2. **Use the correct port.** The forward URL must be `localhost:5173/api/webhook` (port **5173**). A typo like `localhost:173` will send events to the wrong place.
3. **Common causes:** Missing or misconfigured KV binding in local dev (the webhook skips idempotency if `RATION_KV` is not bound), or a checkout session whose `userId`/`organizationId` refer to users/orgs that don’t exist in your local D1 (e.g. you created the session in prod).

## 6. Checklist

- [ ] Stripe CLI running: `stripe listen --forward-to localhost:5173/api/webhook`
- [ ] `STRIPE_WEBHOOK_SECRET` in `.dev.vars` matches the CLI output
- [ ] Dev server was restarted after updating `.dev.vars`
- [ ] Using test mode keys (`sk_test_`, `pk_test_`) in `.dev.vars`
- [ ] App runs on port 5173 (default)
- [ ] You are signed in via the local app (so the user exists in local D1)

## Why this matters

The webhook is responsible for:

- Saving `stripeCustomerId` to the user (from `session.customer`)
- Setting `welcomeVoucherRedeemed = true` when Supply Run completes with 100% discount

Without successful webhooks, the checkout flow never receives `stripeCustomerId`, so each session looks like a new customer and the coupon can be reused.
