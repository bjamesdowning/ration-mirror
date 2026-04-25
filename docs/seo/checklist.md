# SEO and AI Discoverability Checklist

Manual operator actions to run after the SEO/AI-discoverability code changes
ship. Code-side work is in place across the codebase; the items below cannot
be automated and must be done from a human-controlled console.

## After deploying the new robots.txt

- [ ] **Cloudflare dashboard:** Open the `ration.mayutic.com` zone →
      **Security → Bots → AI Crawlers & Scrapers** → set every bot listed
      in [`docs/seo/ai-crawlers.md`](./ai-crawlers.md) to **Allow**.
      Without this, Cloudflare's edge will block the crawlers regardless
      of what our application-level robots.txt says.
- [ ] Verify by running:
      ```
      curl https://ration.mayutic.com/robots.txt | grep -E "GPTBot|ClaudeBot|PerplexityBot"
      ```
      Each should show `Allow: /` on the next line.

## Google Search Console

- [ ] Sign in: <https://search.google.com/search-console>
- [ ] Confirm the `ration.mayutic.com` property is verified.
- [ ] **Sitemaps** → submit/resubmit `https://ration.mayutic.com/sitemap.xml`.
      Wait for status to show "Success" and the URL count to match the
      sitemap (currently 7 static + N blog posts).
- [ ] **URL Inspection** → for each URL below, paste it, click
      **Test Live URL**, then **Request Indexing**. Repeat after every
      meaningful content update.
  - [ ] `https://ration.mayutic.com/`
  - [ ] `https://ration.mayutic.com/about`
  - [ ] `https://ration.mayutic.com/blog`
  - [ ] `https://ration.mayutic.com/blog/meal-planning-loop`
  - [ ] `https://ration.mayutic.com/blog/pantry-data-problem`
  - [ ] `https://ration.mayutic.com/blog/mcp-kitchen-assistant`
  - [ ] `https://ration.mayutic.com/tools`
  - [ ] `https://ration.mayutic.com/tools/unit-converter`
  - [ ] `https://ration.mayutic.com/legal/privacy`
  - [ ] `https://ration.mayutic.com/legal/terms`
- [ ] **Page indexing** → click into the "Not indexed" card and record the
      reason for each URL (e.g. "Crawled - currently not indexed",
      "Discovered - currently not indexed", etc.). The reason determines
      the next action; see <https://support.google.com/webmasters/answer/7440203>.

## Bing Webmaster Tools

Bing powers ChatGPT Search and many AI answer engines. Index health here
matters more than its raw search share suggests.

- [ ] Sign in: <https://www.bing.com/webmasters>
- [ ] Add and verify `ration.mayutic.com` (DNS, HTML file, or HTML meta tag).
- [ ] Submit `https://ration.mayutic.com/sitemap.xml` under **Sitemaps**.
- [ ] Use **URL Submission** to manually submit the same URL list as above.

## IndexNow (one-shot for the URLs above)

Bing/Yandex/Naver/Seznam support IndexNow, which lets you push URL changes
without waiting for a crawl. Optional but cheap.

- [ ] Generate an IndexNow key at <https://www.bing.com/indexnow>.
- [ ] Drop the key file at `public/static/<key>.txt`.
- [ ] Submit URLs via:
      ```
      curl -X POST https://api.indexnow.org/indexnow \
        -H "Content-Type: application/json" \
        -d '{
          "host": "ration.mayutic.com",
          "key": "<your-key>",
          "keyLocation": "https://ration.mayutic.com/static/<key>.txt",
          "urlList": [
            "https://ration.mayutic.com/",
            "https://ration.mayutic.com/about",
            "https://ration.mayutic.com/blog",
            "https://ration.mayutic.com/blog/meal-planning-loop",
            "https://ration.mayutic.com/blog/pantry-data-problem",
            "https://ration.mayutic.com/blog/mcp-kitchen-assistant",
            "https://ration.mayutic.com/tools",
            "https://ration.mayutic.com/tools/unit-converter"
          ]
        }'
      ```

## AI directories and validators

- [ ] Validate structured data: <https://validator.schema.org/> — paste
      each public URL and confirm zero errors.
- [ ] Validate Open Graph: <https://www.opengraph.xyz/>
- [ ] Validate Twitter card: <https://cards-dev.twitter.com/validator>
- [ ] Validate `llms.txt`: visit `https://ration.mayutic.com/llms.txt` and
      `https://ration.mayutic.com/llms-full.txt` directly; confirm
      `Content-Type: text/markdown` and the body parses cleanly.
- [ ] Submit the site to <https://directory.llmstxt.site/> if/when an
      official directory exists for `llms.txt` adopters.

## OG image generation (Phase 6 follow-up)

- [ ] Generate the per-page Open Graph PNGs called out in
      [`public/static/og/README.md`](../../public/static/og/README.md).
- [ ] Once `og-default.png` lands, switch the `OG_IMAGE` constant in
      [`app/lib/seo.ts`](../../app/lib/seo.ts) from the SVG fallback to
      the new PNG (`OG_IMAGE_PNG`).
- [ ] Update each blog post frontmatter to reference its
      `/static/og/<slug>.png`.

## Backlinks and external signals

Indexing for new domains accelerates dramatically with even a couple of
inbound links. Aim for 5-10 contextual mentions in the first 30 days:

- [ ] Add `https://ration.mayutic.com` to GitHub profile, LinkedIn,
      Twitter/X bio, personal website.
- [ ] Submit one cornerstone blog post to Hacker News, Lobste.rs, or
      relevant subreddits (`r/selfhosted`, `r/MealPrepSunday`,
      `r/LocalLLaMA` if covering MCP).
- [ ] Cross-post to dev.to and Hashnode (canonical-tag back to Ration).
- [ ] List on relevant directories: Product Hunt, BetaList,
      `awesome-mcp-servers` on GitHub.

## Ongoing

- [ ] Weekly: check Search Console **Performance** → impressions/clicks
      trend; **Page indexing** → new "not indexed" reasons.
- [ ] Monthly: regenerate `lastmod` dates in
      [`app/routes/sitemap.xml.ts`](../../app/routes/sitemap.xml.ts) for
      any static page that received meaningful content updates.
- [ ] Quarterly: re-validate structured data and OG previews; update
      `llms.txt` and `llms-full.txt` content if product surface area has
      changed.
