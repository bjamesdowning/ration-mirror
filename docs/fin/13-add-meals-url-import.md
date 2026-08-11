# Import a recipe (URL, social, or photo)

## What it does

**Recipe import** extracts structure (title, ingredients, steps) from a **website URL**, a **social video URL** (TikTok / Instagram / YouTube), or a **photo / screenshot**, then creates a new meal in your **Galley** after you review and confirm.

## Credits

Each import costs **3 AI credits** (premium — external fetch/transcript plus Gemini). Credits come from your **organization** balance. Failed automated fetches that return **site blocked** are refunded; a successful assisted retry (paste HTML / on-device capture / photo) is a new **3-credit** job.

## Supported sources

- **Recipe websites** — HTTPS pages with ingredients and directions. If a publisher blocks bots, Ration helps you paste the page HTML (web) or reload on-device (iOS).
- **Social posts** — TikTok, Instagram, and YouTube (including Shorts). Ration uses captions, descriptions, and transcripts when needed.
- **Photos / screenshots** — Upload a clear image of a recipe card, cookbook page, or caption.

Manual Galley entry always remains available.

## Processing and polling

Import runs **asynchronously**. After you submit, the app shows **processing** and **polls** until extraction finishes or an error is returned. You then **verify** the extracted recipe and confirm to add it to Galley.

When nutrition is enabled, Ration prefers a **USDA** match for ingredients; AI nutrient estimates (labelled, not verified until you edit) apply only when nutrition AI estimate is also on for this AI ingest path. Review nutrition before relying on day totals—see *Nutrition overview*.

## Duplicate URLs

If that recipe URL was already imported for your organization, Ration returns a **duplicate** error (you may see this immediately or when the job finishes). Use the existing meal or edit it instead of re-importing.

## When sites block automated import

Some publishers block server-side downloads with bot protection. Ration detects this as **site blocked** and guides you:

- **Web** — Open the recipe, copy the page HTML (or recipe text; keep under ~1MB), paste it into the import dialog, and extract (**3 credits**). Or add the meal manually. If photo import is enabled, you can also import from a screenshot.
- **iOS** — Ration tries loading the page on your device, then re-submits the HTML (**3 credits** if extraction starts). If that still fails, open in Safari, add the meal manually, or use a screenshot when photo import is on.

If pricing shows a different credit cost, **trust the pricing page**.
