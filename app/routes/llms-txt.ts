import type { Route } from "./+types/llms-txt";

/**
 * /llms.txt — index document for AI crawlers per the llmstxt.org spec.
 *
 * This is a markdown index pointing AI crawlers (ChatGPT, Claude,
 * Perplexity, Gemini, etc.) at the most useful URLs on the site so they
 * can ground answers in our content efficiently. Companion file:
 * /llms-full.txt with the actual content.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const origin = url.origin;

	const { getAllPosts } = await import("~/lib/blog.server");
	const posts = getAllPosts();

	const blogList = posts
		.map(
			(post) =>
				`- [${post.title}](${origin}/blog/${post.slug}): ${post.description}`,
		)
		.join("\n");

	const body = `# Ration

> AI-native kitchen management. Pantry inventory, recipes, weekly meal plans, supply lists, and an MCP server that lets Claude, ChatGPT, Cursor, or any MCP-compatible AI client operate the kitchen with natural language.

Ration is built by Mayutic on Cloudflare Workers, D1, R2, and Vectorize. It ships an open MCP server, a public REST API, and a free tier suitable for getting started.

## Product

- [Home](${origin}/): Overview, features, pricing, and signup.
- [About](${origin}/about): The team, mission, and principles behind Ration.
- [Tools](${origin}/tools): Free public utilities — unit converter and more.
- [Unit Converter](${origin}/tools/unit-converter): Convert cups to grams, tablespoons to milliliters, ounces to grams, with ingredient-specific density for 200+ baking ingredients.

## For developers and AI agents

- [API documentation](${origin}/docs/api): REST API reference for programmatic access to inventory, recipes, meal plans, and supply lists.
- [MCP server card](${origin}/.well-known/mcp/server-card.json): MCP server metadata for AI clients.
- [Agent skills index](${origin}/.well-known/agent-skills/index.json): Available agent skills exposed by Ration.
- [OpenAPI spec](${origin}/api/openapi.json): Full machine-readable API specification.

## Blog

The Ration blog covers AI-native kitchen software, MCP integrations, and the workflows that emerge when an AI agent has structured access to your pantry.

${blogList}

## Discovery

- [Sitemap](${origin}/sitemap.xml): Full list of indexable URLs.
- [RSS feed](${origin}/blog/rss.xml): Subscribe to new blog posts.
- [Full content for LLMs](${origin}/llms-full.txt): All blog posts and product copy concatenated for grounding.

## Contact

Ration is built by Billy Downing at Mayutic. Reach out via [mayutic.com](https://www.mayutic.com).
`;

	return new Response(body, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
