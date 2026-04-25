import type { Route } from "./+types/robots-txt";

/**
 * robots.txt — Crawler directives for discovery.
 *
 * Allows splash (/) and legal/blog/tools pages; disallows API, dashboard,
 * auth flows, and other private paths.
 *
 * Explicitly allows major AI crawlers (GPTBot, ClaudeBot, PerplexityBot,
 * Google-Extended, etc.) so we are authoritative about ingestion intent
 * regardless of upstream Cloudflare-managed defaults.
 */
const AI_CRAWLERS = [
	"GPTBot",
	"OAI-SearchBot",
	"ChatGPT-User",
	"ClaudeBot",
	"Claude-SearchBot",
	"Claude-User",
	"anthropic-ai",
	"PerplexityBot",
	"Perplexity-User",
	"Google-Extended",
	"Applebot-Extended",
	"Bytespider",
	"CCBot",
	"meta-externalagent",
	"FacebookBot",
	"Amazonbot",
	"DuckAssistBot",
	"YouBot",
	"cohere-ai",
	"Diffbot",
	"Timpibot",
	"Omgilibot",
	"omgili",
	"Webzio-Extended",
] as const;

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const origin = url.origin;

	const aiAllowBlocks = AI_CRAWLERS.map(
		(bot) => `User-agent: ${bot}\nAllow: /\n`,
	).join("\n");

	const content = `# Ration — https://www.robotstxt.org/robotstxt.html
# Public site policy: AI crawlers and answer engines are explicitly welcome.
# Private surfaces (/api, /hub, /admin, etc.) are disallowed for everyone.

${aiAllowBlocks}
User-agent: *
Allow: /
Allow: /legal/
Allow: /blog/
Allow: /tools/
Allow: /about

Disallow: /api/
Disallow: /hub/
Disallow: /admin/
Disallow: /invitations/
Disallow: /select-group
Disallow: /shared/
Disallow: /auth/

Sitemap: ${origin}/sitemap.xml
`;

	return new Response(content.trim(), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=86400",
		},
	});
}
