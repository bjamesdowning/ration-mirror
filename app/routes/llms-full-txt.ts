import { ABOUT_MARKDOWN, HOME_MARKDOWN } from "~/lib/agent-readiness";
import type { Route } from "./+types/llms-full-txt";

/**
 * /llms-full.txt — concatenated long-form content for AI grounding.
 *
 * Ships the full markdown body of every blog post plus a condensed
 * product brief so AI answer engines can cite Ration without crawling
 * each individual page. Mirrors the llmstxt.org "full" companion spec.
 */

function buildProductBrief(opts: {
	maxInventoryItems: number;
	maxMeals: number;
	maxGroceryLists: number;
	crewMonthlyPrice: string;
	crewAnnualPrice: string;
}): string {
	return `# Ration

Ration is an AI-native kitchen management system. It tracks pantry inventory ("Cargo"),
recipes ("Galley"), weekly meal plans ("Manifest"), and shopping lists ("Supply"), and
exposes an MCP (Model Context Protocol) server so Claude, ChatGPT, Cursor, Zed, and any
other MCP-compatible AI client can operate the kitchen with natural language.

## Architecture

- **Framework:** React Router 7 in framework mode
- **Runtime:** Cloudflare Workers (V8 isolates, no Node.js APIs)
- **Database:** Cloudflare D1 (SQLite at the edge) + Drizzle ORM
- **Object store:** Cloudflare R2
- **Vector search:** Cloudflare Vectorize (semantic recipe and ingredient search)
- **Image AI:** Google Gemini 3.5 Flash via Cloudflare AI Gateway for receipt parsing and recipe generation
- **Auth:** Better Auth (edge-compatible)
- **Payments:** Stripe (Crew Member subscription tier + credit packs)

## Core surfaces

### Cargo (pantry inventory)
A live model of what is in your kitchen — quantities, expiry dates, tags, allergens,
and dry/frozen taxonomy. Cargo is queryable by your AI agent through the MCP server.

### Galley (recipe library)
Recipes and provisions as structured data. "Match Mode" shows what can be cooked right
now and what is missing. Recipes can be imported from URLs via Workers AI.

### Manifest (weekly meal plan)
Schedule breakfast, lunch, dinner, and snacks by intent. Your AI agent can read the
plan and adjust it around real life.

### Supply (shopping list)
Supply lists are auto-generated from planned meals and current Cargo so you only buy
the delta. After shopping, items dock back into Cargo.

## Pricing

- **Free:** ${opts.maxInventoryItems} inventory items, ${opts.maxMeals} recipes, ${opts.maxGroceryLists} supply lists, 1 owned group.
- **Crew Member (${opts.crewMonthlyPrice} or ${opts.crewAnnualPrice}):** Unlimited inventory, recipes, supply lists,
  multi-member group sharing, and MCP access.

Visual scanning and AI meal generation use a credit-based ledger (purchasable via
Stripe) so usage costs are bounded.

## MCP integration

Ration exposes an OAuth-first MCP server at \`https://mcp.ration.mayutic.com/mcp\`.

1. Paste the URL into an MCP-compatible client (Claude Desktop, Cursor, ChatGPT desktop, Zed).
2. Complete browser sign-in, select your household, and approve scoped permissions.
3. Revoke access anytime in Hub → Settings → Connected Agents.

Advanced: organization API keys with \`mcp:*\` scopes for manual header auth and REST v1 import/export.

## Agent-first onboarding

Agents can self-register without human signup:

1. \`POST /api/agent/auth\` with \`{ "type": "anonymous" }\` — returns a full-write API key, claim URL, and MCP endpoint (once).
2. Human claims via OTP at \`/connect/claim\` to transfer ownership (scopes unchanged).

See \`/auth.md\` for the full auth discovery document.
`;
}

export async function loader(_args: Route.LoaderArgs) {
	const { getAllPosts } = await import("~/lib/blog.server");
	const { SUBSCRIPTION_PRODUCTS } = await import("~/lib/stripe.server");
	const { TIER_LIMITS } = await import("~/lib/tiers.server");
	const productBrief = buildProductBrief({
		maxInventoryItems: TIER_LIMITS.free.maxInventoryItems,
		maxMeals: TIER_LIMITS.free.maxMeals,
		maxGroceryLists: TIER_LIMITS.free.maxGroceryLists,
		crewMonthlyPrice: SUBSCRIPTION_PRODUCTS.CREW_MEMBER_MONTHLY.priceUsd,
		crewAnnualPrice: SUBSCRIPTION_PRODUCTS.CREW_MEMBER_ANNUAL.priceUsd,
	});
	const posts = getAllPosts();

	const blogContent = posts
		.map((post) => {
			const tags =
				post.tags.length > 0 ? `**Tags:** ${post.tags.join(", ")}` : "";
			return [
				`# ${post.title}`,
				"",
				`> ${post.description}`,
				"",
				`**Published:** ${post.date}  `,
				`**Updated:** ${post.dateModified}  `,
				`**Author:** ${post.authorName}  `,
				tags,
				"",
				post.content.trim(),
				"",
				"---",
				"",
			]
				.filter(Boolean)
				.join("\n");
		})
		.join("\n");

	const body = [
		productBrief,
		"---",
		"",
		HOME_MARKDOWN.trim(),
		"---",
		"",
		ABOUT_MARKDOWN.trim(),
		"---",
		"",
		"# Blog",
		"",
		blogContent,
	].join("\n");

	return new Response(body, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
