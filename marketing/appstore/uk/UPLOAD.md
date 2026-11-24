# App Store Connect upload checklist (UK)

## iOS 1.6 — large display (6.9-inch)

Upload [`framed/6.9/1.6/`](framed/6.9/1.6/) into **iPhone 6.9" Display**. Do not upload `framed/6.5/` for this submission, and do not upload the older `framed/6.9/01-hub.png` … `10-theme.png` set.

The filename order is the upload order. It stays in this order because the first three are what search shows: the job, the AI choice, then the import.

| Order | File | Caption | Pixels |
|------:|------|---------|--------|
| 1 | `01-daily-fuel.png` | Daily Fuel. / Meals, across the days. | 1320×2868 |
| 2 | `02-agent-sets-fuel.png` | Any agent can run it. / Or use the one inside. | 1320×2868 |
| 3 | `03-import.png` | Save it from the video. / TikTok, Reels, and the web. | 1320×2868 |
| 4 | `04-scan.png` | Scan the receipt. / The cupboard updates. | 1320×2868 |
| 5 | `05-galley.png` | See what you can cook / with what's here | 1320×2868 |
| 6 | `06-manifest.png` | The week's meals. / For everyone in the kitchen. | 1320×2868 |
| 7 | `07-supply.png` | Shop only what / you're still missing | 1320×2868 |
| 8 | `08-hub.png` | The whole kitchen. / Stock, meals, and today. | 1320×2868 |

PNG, RGB, no alpha. Slide 1 adds `Calories, protein, carbs, and fat.` Slide 2 names `Grok · Hermes · Dots · Claude` in type only, and shows Ask Ration beside the person's own agent. Do not upload `08-your-agent.png`.

## iPhone with Dynamic Island (medium display)

This is the 6.1-inch / 6.3-inch slot. 1320×2868 is rejected there. Apple lists 1179×2556, 2556×1179, 1206×2622, and 2622×1206. The frames stay portrait. Upload one whole set, all eight files the same size, in the order above. Prefer [`framed/6.1-6.3/1206x2622/`](framed/6.1-6.3/1206x2622/) (1206×2622). [`framed/6.1-6.3/1179x2556/`](framed/6.1-6.3/1179x2556/) is the other portrait size (1179×2556).

## Header and search results

Both say `Meal planning and macros.` / `You, your agent, or Ration Copilot.`

| Slot | File | Pixels |
|------|------|--------|
| Header | [`header/3840x1646.png`](header/3840x1646.png) | 3840×1646 |
| Header or search | [`header/5244x2950.png`](header/5244x2950.png) | 5244×2950 |
| Search | [`search/5244x2950.png`](search/5244x2950.png) | 5244×2950 |
| Search | [`search/3840x2560.png`](search/3840x2560.png) | 3840×2560 |
| Search | [`search/1920x1280.png`](search/1920x1280.png) | 1920×1280 |

The two 5244×2950 files are the same picture. PNG, RGB, no alpha.

## Screenshots — fix “dimensions are wrong”

That error means the file's pixels are not one of the sizes listed for the slot you dropped it into. 1320×2868 is the large Dynamic Island display. The medium display does not accept it.

| ASC section | Accepted sizes | Our folder |
|-------------|----------------|------------|
| **Dynamic Island, large** (6.9-inch class) | 1320×2868, 1290×2796, 1260×2736 | [`framed/6.9/1.6/`](framed/6.9/1.6/) |
| **Dynamic Island, medium** (6.1-inch / 6.3-inch) | 1206×2622, 1179×2556, and those sizes turned sideways | [`framed/6.1-6.3/`](framed/6.1-6.3/) |
| **Header** | 5244×2950, 3840×1646 | [`header/`](header/) |
| **Search results** | 5244×2950, 3840×2560, 1920×1280 | [`search/`](search/) |
| **iPhone 6.5"** (older fallback) | **1284×2778**, 1242×2688 | [`framed/6.5/`](framed/6.5/) |

**What to do now**

1. In App Store Connect → Previews and Screenshots, click **View All Sizes** (Media Manager).
2. **iPhone with Dynamic Island (large display)** — upload the eight files in [`framed/6.9/1.6/`](framed/6.9/1.6/), all 1320×2868, in the order in the table at the top.
3. **iPhone with Dynamic Island (medium display)** — upload [`framed/6.1-6.3/1206x2622/`](framed/6.1-6.3/1206x2622/), all eight files, all 1206×2622, same order. Do not drop a 1320×2868 file into this slot.
4. Header and search use the files in the table above, one file per size.
5. Leave the older `framed/6.9/01-hub.png` … `10-theme.png` set, and `framed/6.5/`, out of this submission.

Do **not** mix sizes inside one slot. Every screenshot in a slot has to be the same pixel size.

The 6.5-inch fallback, if a later submission needs it, is still [`framed/6.5/`](framed/6.5/) at 1284×2778. Those ten filenames are the previous set, not the 1.6 eight.

## Localisation copy

Paste from [`COPY.md`](COPY.md) into **English (U.K.)** and the primary localisation if it still says Kitchen Hub:

- [ ] Name — `Ration: Meal & Macro Planner`
- [ ] Subtitle — `Pantry, recipes & shopping`
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
- [x] Description includes Terms of Use (EULA) footer (Guideline 3.1.2 metadata) — verify still present
- [ ] License Agreement: Apple Standard EULA
- [ ] Privacy nutrition labels aligned with [`docs/legal/privacy.md`](../../../docs/legal/privacy.md)
- [ ] Age rating questionnaire completed
- [ ] App Review demo account is **Free** tier (not Crew) so subscribe paywall is visible — user `d773eefb-e112-4b75-abe2-066584cd3c1d` / `app-review@mayutic.com`
- [ ] Paywall shows: **Monthly subscription** / **Annual subscription** (auto-renew copy), price, Restore purchases, Terms + Privacy; Manage subscription for App Store Crew. Annual ASC product id is `crew_annual_1yr`.

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
- [ ] Custom product page for recipe import vs macro planning
