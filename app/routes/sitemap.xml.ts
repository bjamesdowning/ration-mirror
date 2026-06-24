import { getSitemapEntries, renderSitemapXml } from "~/lib/sitemap.server";
import type { Route } from "./+types/sitemap.xml";

/**
 * sitemap.xml — Serves indexable URLs for crawler discovery.
 *
 * Per Google's current guidance we only emit <loc> and <lastmod>;
 * <priority> and <changefreq> are ignored and have been removed.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const origin = url.origin;
	const xml = renderSitemapXml(origin, getSitemapEntries());

	return new Response(xml.trim(), {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
