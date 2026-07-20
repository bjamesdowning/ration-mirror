# App Store marketing assets

Locale-specific App Store Connect materials for Ration iOS.

| Path | Purpose |
|------|---------|
| [`uk/`](uk/) | English (U.K.) — primary launch locale |
| [`uk/COPY.md`](uk/COPY.md) | Name, subtitle, promotional text, description, keywords |
| [`uk/STORYBOARD.md`](uk/STORYBOARD.md) | Screenshot order and captions |
| [`uk/UPLOAD.md`](uk/UPLOAD.md) | ASC upload checklist |
| [`uk/raw/`](uk/raw/) | Full-res device screenshots (1320×2868) |
| [`uk/framed/6.9/`](uk/framed/6.9/) | Marketing frames **1320×2868** (ASC iPhone 6.9") |
| [`uk/framed/6.5/`](uk/framed/6.5/) | Marketing frames **1284×2778** (ASC iPhone 6.5") |
| [`uk/frame_screenshots.py`](uk/frame_screenshots.py) | Regenerates `framed/` from `raw/` |

Regenerate frames:

```bash
cd marketing/appstore/uk
python3 -m venv .venv && .venv/bin/pip install Pillow
.venv/bin/python frame_screenshots.py
```
