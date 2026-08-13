# Screenshot storyboard — English (U.K.)

Upload order in App Store Connect → Media Manager → **iPhone 6.9"** (1320×2868). Apple shows the first three in search.

| Slot | Layout | Caption | Raw source | Framed 6.9" | Framed 6.5" |
|------|--------|---------|------------|-------------|-------------|
| 1 | zoom | Plan meals from what's in stock | [`raw/01-hub.png`](raw/01-hub.png) | [`framed/6.9/01-hub.png`](framed/6.9/01-hub.png) | [`framed/6.5/01-hub.png`](framed/6.5/01-hub.png) |
| 2 | zoom | Macros from meals you actually cook | [`raw/01-hub.png`](raw/01-hub.png) | [`framed/6.9/02-macros.png`](framed/6.9/02-macros.png) | [`framed/6.5/02-macros.png`](framed/6.5/02-macros.png) |
| 3 | social | Save recipes from TikTok, Reels & the web | [`raw/03-share.png`](raw/03-share.png) + [`raw/03-import.png`](raw/03-import.png) | [`framed/6.9/03-import.png`](framed/6.9/03-import.png) | [`framed/6.5/03-import.png`](framed/6.5/03-import.png) |
| 4 | zoom | Scan a receipt or the fridge | [`raw/04-scan.png`](raw/04-scan.png) + [`raw/02-cargo.png`](raw/02-cargo.png) | [`framed/6.9/04-scan.png`](framed/6.9/04-scan.png) | [`framed/6.5/04-scan.png`](framed/6.5/04-scan.png) |
| 5 | zoom | See what you can cook with what's here | [`raw/05-galley.png`](raw/05-galley.png) | [`framed/6.9/05-galley.png`](framed/6.9/05-galley.png) | [`framed/6.5/05-galley.png`](framed/6.5/05-galley.png) |
| 6 | device | Plan the week. AI fills the days. | [`raw/06-plan.png`](raw/06-plan.png) | [`framed/6.9/06-plan.png`](framed/6.9/06-plan.png) | [`framed/6.5/06-plan.png`](framed/6.5/06-plan.png) |
| 7 | zoom | Cook for the house. Log your plate. | [`raw/07-manifest.png`](raw/07-manifest.png) | [`framed/6.9/07-manifest.png`](framed/6.9/07-manifest.png) | [`framed/6.5/07-manifest.png`](framed/6.5/07-manifest.png) |
| 8 | device | Shop only what you're still missing | [`raw/08-supply.png`](raw/08-supply.png) | [`framed/6.9/08-supply.png`](framed/6.9/08-supply.png) | [`framed/6.5/08-supply.png`](framed/6.5/08-supply.png) |
| 9 | zoom | Your kitchen copilot, on live stock | [`raw/09-ask.png`](raw/09-ask.png) | [`framed/6.9/09-ask.png`](framed/6.9/09-ask.png) | [`framed/6.5/09-ask.png`](framed/6.5/09-ask.png) |
| 10 | split | Light or dark. Same kitchen. | [`raw/10-hub-light.png`](raw/10-hub-light.png) + [`raw/01-hub.png`](raw/01-hub.png) | [`framed/6.9/10-theme.png`](framed/6.9/10-theme.png) | [`framed/6.5/10-theme.png`](framed/6.5/10-theme.png) |

Previous v1 frames (full-phone, jargon captions) are archived under [`raw/_archive_v1/`](raw/_archive_v1/).

## Narrative

1–3 appear in search results — outcome (Hub + macros), proof (Daily Fuel), differentiator (Share → Ration from TikTok).
4–8 walk the closed loop: scan → cook from stock → plan week → cook/log → shop the gap.
9 is Copilot on live inventory. 10 satisfies Apple’s light/dark guidance.

## Regenerate framed assets

```bash
cd marketing/appstore/uk
python3 -m venv .venv && .venv/bin/pip install Pillow
.venv/bin/python frame_screenshots.py
```

Or from repo root:

```bash
marketing/appstore/uk/.venv/bin/python marketing/appstore/uk/frame_screenshots.py
```

## Specs

- **6.9"**: **1320 × 2868** → ASC “iPhone 6.9" Display” ([`framed/6.9/`](framed/6.9/))
- **6.5"**: **1284 × 2778** → ASC “iPhone 6.5" Display” ([`framed/6.5/`](framed/6.5/))
- PNG, RGB, no alpha
- Brand: Carbon `#111111`, Ceramic `#F8F9FA`, Hyper-Green `#00E088`, Space Mono Bold captions
- UI: photographic from `raw/` (not redrawn). No official Instagram/TikTok logos as extra chrome.

If ASC says dimensions should be 1242×2688 / 1284×2778, you are in the **6.5"** slot — upload `framed/6.5/`, or switch to **6.9"** via View All Sizes and use `framed/6.9/`.
