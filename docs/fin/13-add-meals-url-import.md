# Import a recipe (URL, social, or photo)

## What it does

**Recipe import** extracts structure (title, ingredients, steps) from a **website URL**, a **social video URL** (TikTok / Instagram / YouTube), or a **photo / screenshot**, then creates a new meal in your **Galley** after you review and confirm.

URL imports follow a **completeness ladder**: full recipe → partial skeleton (ingredient names / steps without full quantities) → **link holder** (meal name from metadata + source URL saved). You always leave with something to review for URL lanes—never an empty dead-end.

## Credits

Each import costs **3 AI credits** (premium — external fetch/transcript plus Gemini). Credits come from your **organization** balance. Holder and skeleton successes are **completed jobs** (no refund)—you received a meal. Hard infra failures (auth, credits, invalid URL) still refund when applicable. A successful assisted retry (paste HTML / on-device capture / photo) is a new **3-credit** job.

## Supported sources

- **Recipe websites** — HTTPS pages with ingredients and directions. If a publisher blocks bots, Ration still saves a link-holder meal you can open later; you can also paste page HTML (web) or reload on-device (iOS).
- **Social posts** — TikTok, Instagram, and YouTube (including Shorts). Ration pulls platform metadata (including Supadata title/description), then uses a native video transcript only when the caption is still too thin for a recipe. On iOS, use **Share → Ration** from the social app to open Import with the URL prefilled.
- **Photos / screenshots** — Upload a clear image of a recipe card, cookbook page, or caption.

Manual Galley entry always remains available.

## Processing and polling

Import runs **asynchronously**. After you submit, the app shows **processing** and **polls** until extraction finishes. You then **verify** the extracted recipe (badge: Full / Partial / Saved link) and confirm to add it to Galley. Meals keep `customFields.sourceUrl` so **View source** opens the original page or video.

When nutrition is enabled, Ration prefers a **USDA** match for ingredients; AI nutrient estimates (labelled, not verified until you edit) apply only when nutrition AI estimate is also on for this AI ingest path. Review nutrition before relying on day totals—see *Nutrition overview*.

## Duplicate URLs

If that recipe URL was already imported for your organization, Ration returns a **duplicate** error (you may see this immediately or when the job finishes). Use the existing meal or edit it instead of re-importing.

## When sites block automated import

Some publishers block server-side downloads with bot protection. Ration still prefers a **saved-link holder** so you keep the URL. Optional recovery:

- **Web** — Open the recipe, copy the page HTML (or recipe text; keep under ~1MB), paste it into the import dialog, and extract (**3 credits**). Or add the meal manually. If photo import is enabled, you can also import from a screenshot.
- **iOS** — Ration may try loading the page on your device, then re-submit the HTML (**3 credits** if extraction starts). You can also open in Safari, edit the holder meal, or use a screenshot when photo import is on.

If pricing shows a different credit cost, **trust the pricing page**.
