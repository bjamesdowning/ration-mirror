# Open Graph images

Per-page Open Graph (OG) images live here. They are referenced from blog post
markdown frontmatter via the `image:` field, and from `app/lib/seo.ts` as the
default fallback (`og-default.png`).

## Required dimensions

- **Width:** 1200 px
- **Height:** 630 px (1.91:1 aspect ratio — the standard for Twitter/X,
  LinkedIn, Facebook, Slack, Discord, and most AI answer cards)
- **Format:** PNG or WebP. Avoid SVG — many social previewers and AI cards
  do not render SVG reliably.
- **Max file size:** ~300 KB. Larger files cause some scrapers to skip the
  image entirely.

## Naming convention

- `og-default.png` — sitewide fallback, used when a route does not specify
  its own OG image.
- `<post-slug>.png` — per-blog-post image, referenced from the post's
  frontmatter as `image: /static/og/<post-slug>.png`.

## Example frontmatter

\`\`\`yaml
---
title: Your Kitchen Has an API Now
slug: mcp-kitchen-assistant
description: How to connect Ration to Claude, Cursor, and any MCP client.
date: 2026-03-10
image: /static/og/mcp-kitchen-assistant.png
tags: [mcp, claude, ai-agents]
---
\`\`\`

## Outstanding assets

The following images are referenced but not yet generated. Drop them in this
folder when ready:

- [ ] `og-default.png` — sitewide fallback (logo + tagline on Ceramic White
      background with Hyper-Green accent)
- [ ] `meal-planning-loop.png` — for `/blog/meal-planning-loop`
- [ ] `pantry-data-problem.png` — for `/blog/pantry-data-problem`
- [ ] `mcp-kitchen-assistant.png` — for `/blog/mcp-kitchen-assistant`

Until each per-post image exists, the post will fall through to the sitewide
`OG_IMAGE` defined in `app/lib/seo.ts`.

## Brand cheat sheet

- Background: `#F8F9FA` (Ceramic White) or `#111111` (Carbon)
- Accent: `#00E088` (Hyper-Green)
- Typography: Space Mono for headlines, weight 700
- Logo: place top-left at 40 px from each edge
- Title: 64 px, line-height 1.05, max 6-8 words
- Subtitle (optional): 28 px, color `#777`
