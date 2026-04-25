import type { Route } from "./+types/sitemap.xml";

/**
 * sitemap.xml — Serves indexable URLs for crawler discovery.
 *
 * Per Google's current guidance we only emit <loc> and <lastmod>;
 * <priority> and <changefreq> are ignored and have been removed.
 */

// Static pages with their last-modified date. Bump these when the page
// content changes meaningfully so crawlers know to revisit.
const STATIC_PAGES: ReadonlyArray<{ path: string; lastmod: string }> = [
	{ path: "/", lastmod: "2026-04-25" },
	{ path: "/about", lastmod: "2026-04-25" },
	{ path: "/blog", lastmod: "2026-04-25" },
	{ path: "/tools", lastmod: "2026-04-25" },
	{ path: "/tools/unit-converter", lastmod: "2026-04-25" },
	{ path: "/legal/terms", lastmod: "2026-04-25" },
	{ path: "/legal/privacy", lastmod: "2026-04-25" },
];

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const origin = url.origin;

	const { getAllPosts } = await import("~/lib/blog.server");
	const posts = getAllPosts();

	const staticEntries = STATIC_PAGES.map(
		({ path, lastmod }) =>
			`  <url><loc>${origin}${path}</loc><lastmod>${lastmod}</lastmod></url>`,
	);

	const blogEntries = posts.map(
		(post) =>
			`  <url><loc>${origin}/blog/${post.slug}</loc><lastmod>${post.dateModified}</lastmod></url>`,
	);

	const urls = [...staticEntries, ...blogEntries].join("\n");

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

	return new Response(xml.trim(), {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
