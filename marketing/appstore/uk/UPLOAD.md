# App Store Connect upload checklist (UK)

## Screenshots — fix “dimensions are wrong”

That error means you dropped files into the **wrong display class**.

| ASC section | Accepted sizes | Our folder |
|-------------|----------------|------------|
| **iPhone 6.9"** (preferred) | 1320×2868, 1290×2796, 1260×2736 | [`framed/6.9/`](framed/6.9/) |
| **iPhone 6.5"** (fallback) | **1284×2778**, 1242×2688 | [`framed/6.5/`](framed/6.5/) |

**What to do now**

1. In App Store Connect → Previews and Screenshots, click **View All Sizes** (Media Manager).
2. Prefer **iPhone 6.9" Display** → upload `framed/6.9/01-hub.png` … `08-supply.png`.
3. If the UI only shows **6.5"** (or you already started there), upload `framed/6.5/` instead — those are **1284×2778**, matching the error message.

Do **not** mix: 1320×2868 files into the 6.5" slot will always fail.

### Upload order (both sizes)

| Order | File |
|-------|------|
| 1 | `01-hub.png` |
| 2 | `02-cargo.png` |
| 3 | `03-ask.png` |
| 4 | `04-scan.png` |
| 5 | `05-galley.png` |
| 6 | `06-generate.png` |
| 7 | `07-manifest.png` |
| 8 | `08-supply.png` |

PNG, RGB, no alpha. Apple scales a 6.9" set down for smaller phones if you provide it.

Regenerate both sizes:

```bash
cd marketing/appstore/uk
.venv/bin/python frame_screenshots.py
```

## Localisation copy

Paste from [`COPY.md`](COPY.md) into **English (U.K.)**:

- [ ] Name
- [ ] Subtitle
- [ ] Promotional Text
- [ ] Description
- [ ] Keywords
- [ ] What’s New

## App information

- [ ] Primary category: **Food & Drink**
- [ ] Secondary: **Lifestyle**
- [ ] Marketing URL: `https://ration.mayutic.com`
- [ ] Support URL: from [`plans/app-review-notes.md`](../../../plans/app-review-notes.md)
- [ ] Privacy Policy: `https://ration.mayutic.com/legal/privacy`
- [ ] Privacy nutrition labels aligned with [`docs/legal/privacy.md`](../../../docs/legal/privacy.md)
- [ ] Age rating questionnaire completed

## App Review

- [ ] Sign-in required checked; User Name `app-review@mayutic.com`
- [ ] Password matches current `APP_REVIEW_DEMO_PASSWORD` Wrangler secret
- [ ] Notes for Review pasted from [`plans/app-review-notes.md`](../../../plans/app-review-notes.md)
- [ ] Flagship `app-review-login` **enabled** for the review window

## IAP

- [ ] RevenueCat / ASC products match [`ios/Ration/Core/Billing/BillingProductCatalog.swift`](../../../ios/Ration/Core/Billing/BillingProductCatalog.swift)

## Optional later

- [ ] App Preview video (15–30s)
- [ ] Product Page Optimization A/B on frame 1 caption
- [ ] English (U.S.) localisation pass
