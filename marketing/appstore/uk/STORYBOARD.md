# Screenshot storyboard — English (U.K.)

Upload order in App Store Connect → Media Manager → **iPhone 6.9"** (1320×2868).

| Slot | Caption | Raw source | Framed 6.9" | Framed 6.5" |
|------|---------|------------|-------------|-------------|
| 1 | Your kitchen, operable by AI | [`raw/01-hub.png`](raw/01-hub.png) | [`framed/6.9/01-hub.png`](framed/6.9/01-hub.png) | [`framed/6.5/01-hub.png`](framed/6.5/01-hub.png) |
| 2 | Know your stock before it spoils | [`raw/02-cargo.png`](raw/02-cargo.png) | [`framed/6.9/02-cargo.png`](framed/6.9/02-cargo.png) | [`framed/6.5/02-cargo.png`](framed/6.5/02-cargo.png) |
| 3 | Ask Ration. Live kitchen answers | [`raw/03-ask.png`](raw/03-ask.png) | [`framed/6.9/03-ask.png`](framed/6.9/03-ask.png) | [`framed/6.5/03-ask.png`](framed/6.5/03-ask.png) |
| 4 | Scan once. Cargo stays current | [`raw/04-scan.png`](raw/04-scan.png) | [`framed/6.9/04-scan.png`](framed/6.9/04-scan.png) | [`framed/6.5/04-scan.png`](framed/6.5/04-scan.png) |
| 5 | See meals you can cook right now | [`raw/05-galley.png`](raw/05-galley.png) | [`framed/6.9/05-galley.png`](framed/6.9/05-galley.png) | [`framed/6.5/05-galley.png`](framed/6.5/05-galley.png) |
| 6 | Meal ideas from what you already have | [`raw/06-generate.png`](raw/06-generate.png) | [`framed/6.9/06-generate.png`](framed/6.9/06-generate.png) | [`framed/6.5/06-generate.png`](framed/6.5/06-generate.png) |
| 7 | Plan the week. Keep the crew aligned | [`raw/07-manifest.png`](raw/07-manifest.png) | [`framed/6.9/07-manifest.png`](framed/6.9/07-manifest.png) | [`framed/6.5/07-manifest.png`](framed/6.5/07-manifest.png) |
| 8 | Shop only what you're still missing | [`raw/08-supply.png`](raw/08-supply.png) | [`framed/6.9/08-supply.png`](framed/6.9/08-supply.png) | [`framed/6.5/08-supply.png`](framed/6.5/08-supply.png) |

## Narrative

1–3 appear in search results — outcome (Hub), proof (Cargo), differentiator (Ask Ration).  
4–6 deepen AI intake and cook-from-stock.  
7–8 close the Manifest → Supply loop.

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
- Brand: Carbon `#111111`, Hyper-Green `#00E088`, Space Mono Bold captions
- UI: photographic from `raw/` (not redrawn)

If ASC says dimensions should be 1242×2688 / 1284×2778, you are in the **6.5"** slot — upload `framed/6.5/`, or switch to **6.9"** via View All Sizes and use `framed/6.9/`.
