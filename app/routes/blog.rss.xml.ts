import type { Route } from "./+types/blog.rss.xml";

/**
 * /blog/rss.xml — RSS 2.0 feed of all blog posts.
 *
 * Surfaced by AI answer engines, RSS readers, and aggregators. Each item
 * uses the post's ISO-8601 dateModified as the pubDate so the feed
 * resorts naturally when posts are updated.
 */

const SITE_TITLE = "Ration Blog";
const SITE_DESCRIPTION =
	"Tips for pantry organization, meal planning, reducing food waste, and using Ration with AI assistants.";

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function toRfc822(isoDate: string): string {
	const d = new Date(isoDate);
	if (Number.isNaN(d.getTime())) return new Date().toUTCString();
	return d.toUTCString();
}

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const origin = url.origin;

	const { getAllPosts } = await import("~/lib/blog.server");
	const posts = getAllPosts();

	const items = posts
		.map((post) => {
			const link = escapeXml(`${origin}/blog/${post.slug}`);
			return [
				"    <item>",
				`      <title>${escapeXml(post.title)}</title>`,
				`      <link>${link}</link>`,
				`      <guid isPermaLink="true">${link}</guid>`,
				`      <pubDate>${toRfc822(post.dateModified)}</pubDate>`,
				`      <description>${escapeXml(post.description)}</description>`,
				`      <author>noreply@mayutic.com (${escapeXml(post.authorName)})</author>`,
				...post.tags.map(
					(tag) => `      <category>${escapeXml(tag)}</category>`,
				),
				"    </item>",
			].join("\n");
		})
		.join("\n");

	const lastBuildDate = toRfc822(
		posts[0]?.dateModified ?? new Date().toISOString(),
	);

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${escapeXml(`${origin}/blog`)}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(`${origin}/blog/rss.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

	return new Response(xml.trim(), {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
