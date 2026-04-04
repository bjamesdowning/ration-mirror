# Import a recipe from a URL

## What it does

**URL import** fetches a public recipe page, extracts structure (title, ingredients, steps), and creates a new meal in your **Galley**.

## Credits

URL import costs **1 AI credit** per job. Credits come from your **organization** balance.

## HTTPS only

Only **https://** recipe URLs are accepted. This protects against unsafe internal network requests.

## Processing and polling

Import runs **asynchronously**. After you submit a URL, the app shows **processing** and **polls** until the meal is created or an error is returned.

## Duplicate URLs

If that recipe URL was already imported for your organization, Ration returns a **duplicate** error (you may see this immediately or when the job finishes). Use the existing meal or edit it instead of re-importing.

## When import struggles

Some sites block simple downloads or need JavaScript. Ration may retry with a richer fetch path when configured. If import fails, add the recipe **manually** or try a different source URL.

If pricing shows a different credit cost, **trust the pricing page**.
