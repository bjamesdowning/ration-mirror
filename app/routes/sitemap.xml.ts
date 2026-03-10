import type { Route } from "./+types/sitemap.xml";

const INDEXABLE_PATHS = ["/", "/legal/terms", "/legal/privacy"] as const;

/**
 * sitemap.xml — Serves indexable URLs for crawler discovery.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const origin = url.origin;

	const urls = INDEXABLE_PATHS.map(
		(path) =>
			`  <url><loc>${origin}${path}</loc><changefreq>weekly</changefreq><priority>${path === "/" ? "1.0" : "0.8"}</priority></url>`,
	).join("\n");

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
