import type { Route } from "./+types/llms-full-txt";

/**
 * /llms-full.txt — concatenated long-form content for AI grounding.
 *
 * Ships the full markdown body of every blog post plus a condensed
 * product brief so AI answer engines can cite Ration without crawling
 * each individual page. Mirrors the llmstxt.org "full" companion spec.
 */

const PRODUCT_BRIEF = `# Ration

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
- **Image AI:** Cloudflare Workers AI with Llama 3 Vision for receipt parsing
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

- **Free:** 35 inventory items, 15 recipes, 3 supply lists, 1 owned group.
- **Crew Member ($5/mo or $50/yr):** Unlimited inventory, recipes, supply lists,
  multi-member group sharing, and MCP access.

Visual scanning and AI meal generation use a credit-based ledger (purchasable via
Stripe) so usage costs are bounded.

## MCP integration

Ration exposes an MCP server at \`https://mcp.ration.mayutic.com\`. Connect any
MCP-compatible client (Claude Desktop, Cursor, Zed, ChatGPT desktop, OpenAI's
Agent SDK) to read inventory, find cookable meals, plan a week, generate supply
lists, and consume ingredients after cooking — all in natural language.
`;

export async function loader(_args: Route.LoaderArgs) {
	const { getAllPosts } = await import("~/lib/blog.server");
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

	const body = `${PRODUCT_BRIEF}\n\n---\n\n# Blog\n\n${blogContent}`;

	return new Response(body, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
