import type { Route } from "./+types/sitemap.xml";

const STATIC_PATHS = [
	"/",
	"/legal/terms",
	"/legal/privacy",
	"/blog",
	"/tools",
	"/tools/unit-converter",
] as const;

function priorityForPath(path: string): string {
	if (path === "/") return "1.0";
	if (path === "/blog" || path === "/tools") return "0.9";
	if (path === "/tools/unit-converter") return "0.85";
	return "0.8";
}

/**
 * sitemap.xml — Serves indexable URLs for crawler discovery.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const origin = url.origin;

	const { getAllPosts } = await import("~/lib/blog.server");
	const posts = getAllPosts();

	const staticEntries = STATIC_PATHS.map(
		(path) =>
			`  <url><loc>${origin}${path}</loc><changefreq>weekly</changefreq><priority>${priorityForPath(path)}</priority></url>`,
	);

	const blogEntries = posts.map(
		(post) =>
			`  <url><loc>${origin}/blog/${post.slug}</loc><lastmod>${post.date}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
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
