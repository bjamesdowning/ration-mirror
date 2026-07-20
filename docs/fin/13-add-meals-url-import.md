# Import a recipe from a URL

## What it does

**URL import** fetches a public recipe page, extracts structure (title, ingredients, steps), and creates a new meal in your **Galley** after you review and confirm.

## Credits

URL import costs **1 AI credit** per job. Credits come from your **organization** balance. Failed automated fetches that return **site blocked** are refunded; a successful assisted retry (paste HTML / on-device capture) is a new 1-credit job.

## Requirements

- **HTTPS recipe webpage** — Only **https://** URLs that open a recipe page (ingredients and directions in HTML) are supported. This also protects against unsafe internal network requests.
- **Not supported** — Video links (YouTube, TikTok, Instagram Reels, and similar) and non-recipe pages. Import needs readable recipe HTML, not a video player.
- Manual Galley entry always remains available if a link cannot be imported.

## Processing and polling

Import runs **asynchronously**. After you submit a URL, the app shows **processing** and **polls** until extraction finishes or an error is returned. You then **verify** the extracted recipe and confirm to add it to Galley.

## Duplicate URLs

If that recipe URL was already imported for your organization, Ration returns a **duplicate** error (you may see this immediately or when the job finishes). Use the existing meal or edit it instead of re-importing.

## When sites block automated import

Some publishers block server-side downloads with bot protection. Ration detects this as **site blocked** and guides you:

- **Web** — Open the recipe, copy the page HTML (or recipe text; keep under ~1MB), paste it into the import dialog, and extract (1 credit). Or add the meal manually.
- **iOS** — Ration tries loading the page on your device, then re-submits the HTML (1 credit if extraction starts). If that still fails, open in Safari and add the meal manually.

If pricing shows a different credit cost, **trust the pricing page**.
