import {
	buildLlmsComparisonFacts,
	formatLlmsComparisonFactsMarkdown,
} from "~/lib/llms-comparison-facts.server";
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
	const { SUBSCRIPTION_PRODUCTS } = await import("~/lib/stripe.server");
	const { TIER_LIMITS } = await import("~/lib/tiers.server");
	const posts = getAllPosts();

	const comparisonFacts = formatLlmsComparisonFactsMarkdown(
		buildLlmsComparisonFacts({
			origin,
			maxInventoryItems: TIER_LIMITS.free.maxInventoryItems,
			maxMeals: TIER_LIMITS.free.maxMeals,
			maxGroceryLists: TIER_LIMITS.free.maxGroceryLists,
			crewMonthlyPrice: SUBSCRIPTION_PRODUCTS.CREW_MEMBER_MONTHLY.priceEur,
			crewAnnualPrice: SUBSCRIPTION_PRODUCTS.CREW_MEMBER_ANNUAL.priceEur,
		}),
	);

	const blogList = posts
		.map(
			(post) =>
				`- [${post.title}](${origin}/blog/${post.slug}): ${post.description}`,
		)
		.join("\n");

	const body = `# Ration

> AI pantry management in one closed loop. Track inventory, match recipes, plan meals, and build shopping lists with the built-in Ration Copilot or an OAuth MCP connection for Claude, ChatGPT, Cursor, and other compatible assistants.

Ration is built by Mayutic on Cloudflare Workers, D1, R2, and Vectorize. Copilot is the in-app AI kitchen assistant; MCP gives external agents scoped access to the same live household data. It also ships a public REST API and a free tier. A native iOS app is coming soon; the responsive web app and PWA are available now.

${comparisonFacts}

## Product

- [Home](${origin}/): Closed-loop AI pantry management, Copilot and MCP control, pricing, iOS status, and signup.
- [About](${origin}/about): The team, mission, and principles behind Ration.
- [Tools](${origin}/tools): Free public utilities — unit converter and more.
- [Unit Converter](${origin}/tools/unit-converter): Convert cups to grams, tablespoons to milliliters, ounces to grams, with ingredient-specific density for 200+ baking ingredients.

## For developers and AI agents

- [API documentation](${origin}/docs/api): REST API and OAuth MCP connection guide.
- [MCP server card](${origin}/.well-known/mcp/server-card.json): MCP server metadata (oauth2 transport).
- [OAuth authorization server](${origin}/.well-known/oauth-authorization-server): OAuth 2.1 metadata for MCP clients.
- [Agent skills index](${origin}/.well-known/agent-skills/index.json): Available agent skills exposed by Ration.
- [Auth discovery (auth.md)](${origin}/auth.md): Agent-first onboarding flows (anonymous + user-claimed).
- [Connect agents](${origin}/connect): One-click MCP setup for Cursor, Claude, and ChatGPT.
- [MCP listing (mcp.md)](${origin}/mcp.md): Product overview and directory listing for mcpservers.org and similar indexes.

## Blog

The Ration blog covers AI-native kitchen software, MCP integrations, and the workflows that emerge when an AI agent has structured access to your pantry.

${blogList}

## Discovery

- [Sitemap](${origin}/sitemap.xml): Full list of indexable URLs.
- [RSS feed](${origin}/blog/rss.xml): Subscribe to new blog posts.
- [Full content for LLMs](${origin}/llms-full.txt): All blog posts and product copy concatenated for grounding.

## Contact

Ration is built by Mayutic. Reach out via [mayutic.com](https://www.mayutic.com).
`;

	return new Response(body, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
