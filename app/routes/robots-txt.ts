import type { Route } from "./+types/robots-txt";

/**
 * robots.txt — Crawler directives for discovery.
 * Allows splash (/) and legal pages; disallows API, dashboard, auth flows.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const origin = url.origin;

	const content = `# Ration — https://www.robotstxt.org/robotstxt.html
User-agent: *
Allow: /
Allow: /legal/
Allow: /blog/
Allow: /tools/

Disallow: /api/
Disallow: /hub/
Disallow: /admin/
Disallow: /invitations/
Disallow: /select-group
Disallow: /shared/

Sitemap: ${origin}/sitemap.xml
`;

	return new Response(content.trim(), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=86400",
		},
	});
}
