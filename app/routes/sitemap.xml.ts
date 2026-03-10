import type { Route } from "./+types/sitemap.xml";

const STATIC_PATHS = [
	"/",
	"/legal/terms",
	"/legal/privacy",
	"/blog",
	"/tools",
	"/tools/unit-converter",
] as const;

/**
 * sitemap.xml — Serves indexable URLs for crawler discovery.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const origin = url.origin;

	const { getAllSlugs } = await import("~/lib/blog.server");
	const blogSlugs = getAllSlugs();
	const blogPaths = blogSlugs.map((slug) => `/blog/${slug}`);
	const allPaths = [...STATIC_PATHS, ...blogPaths];

	const urlEntries = allPaths.map((path) => {
		const priority =
			path === "/"
				? "1.0"
				: path === "/blog" || path === "/tools"
					? "0.9"
					: path === "/tools/unit-converter"
						? "0.85"
						: "0.8";
		return `  <url><loc>${origin}${path}</loc><changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
	});
	const urls = urlEntries.join("\n");

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
