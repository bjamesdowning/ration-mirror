/**
 * Public `/help` allowlist for customer-facing `docs/fin` articles.
 * Maintainer-only files (README, INDEX, QA-CHECKLIST, 70-*) are excluded.
 */

export type HelpArticleMeta = {
	/** Filename stem without `.md` (URL slug). */
	slug: string;
	title: string;
	/** One-line purpose for DIRECTORY / index pages. */
	summary: string;
	/** Collection heading for DIRECTORY grouping. */
	section: HelpSectionId;
};

export type HelpSectionId =
	| "overview"
	| "kitchen"
	| "billing"
	| "agents"
	| "security"
	| "limits"
	| "troubleshooting";

export const HELP_SECTIONS: ReadonlyArray<{
	id: HelpSectionId;
	title: string;
}> = [
	{ id: "overview", title: "Overview" },
	{ id: "kitchen", title: "Kitchen loop" },
	{ id: "billing", title: "Billing and credits" },
	{ id: "agents", title: "Agents and API" },
	{ id: "security", title: "Security and privacy" },
	{ id: "limits", title: "Architecture and limits" },
	{ id: "troubleshooting", title: "Troubleshooting" },
];

/** Customer-facing articles only, in display order within each section. */
export const HELP_ARTICLES: ReadonlyArray<HelpArticleMeta> = [
	{
		slug: "01-what-is-ration",
		title: "What is Ration?",
		summary: "Product overview: Cargo, Galley, Manifest, and Supply.",
		section: "overview",
	},
	{
		slug: "02-key-concepts",
		title: "Key concepts",
		summary: "Organizations, credits, and the four kitchen surfaces.",
		section: "overview",
	},
	{
		slug: "03-account-and-sign-in",
		title: "Account and sign-in",
		summary: "Magic link, Google sign-in, and profile basics.",
		section: "overview",
	},
	{
		slug: "04-switching-groups",
		title: "Switching groups",
		summary: "Choose the active organization and keep data isolated.",
		section: "overview",
	},
	{
		slug: "05-groups-membership",
		title: "Groups and membership",
		summary: "Invite, roles, ownership transfer, credits, and delete group.",
		section: "overview",
	},
	{
		slug: "06-ask-ration-vs-reading-docs",
		title: "Ask Ration vs reading the guide",
		summary: "Same source of truth for Copilot and self-serve reading.",
		section: "overview",
	},
	{
		slug: "10-cargo-inventory",
		title: "Cargo (pantry inventory)",
		summary: "Add, edit, restock, jettison, import, and promote items.",
		section: "kitchen",
	},
	{
		slug: "11-receipt-scan",
		title: "Receipt scanning",
		summary: "Scan a receipt into Cargo with AI credits.",
		section: "kitchen",
	},
	{
		slug: "12-galley-recipes",
		title: "Galley (recipes and provisions)",
		summary: "Create meals, cook from stock, and select for Supply.",
		section: "kitchen",
	},
	{
		slug: "13-add-meals-url-import",
		title: "Import a recipe from a URL",
		summary: "Pull a recipe from an HTTPS page into Galley.",
		section: "kitchen",
	},
	{
		slug: "14-ai-meal-generation",
		title: "AI meal generation",
		summary: "Generate recipe ideas from your pantry.",
		section: "kitchen",
	},
	{
		slug: "15-manifest-meal-plan",
		title: "Manifest (meal plan)",
		summary: "Schedule meals, consume entries, and share the week.",
		section: "kitchen",
	},
	{
		slug: "16-supply-shopping-list",
		title: "Supply (shopping list)",
		summary: "Sync, shop, snooze, share, and dock purchases into Cargo.",
		section: "kitchen",
	},
	{
		slug: "17-matching-cookable-meals",
		title: "Matching cookable meals",
		summary: "Strict vs partial pantry match for meals ready to cook.",
		section: "kitchen",
	},
	{
		slug: "18-hub-dashboard-and-settings",
		title: "Hub dashboard and settings",
		summary: "Widgets, preferences, developer tools, and account purge.",
		section: "kitchen",
	},
	{
		slug: "19-kitchen-loop",
		title: "The kitchen loop",
		summary: "How Cargo, Galley, Manifest, and Supply work together.",
		section: "kitchen",
	},
	{
		slug: "20-credits-explained",
		title: "AI credits explained",
		summary: "What spends credits and what does not.",
		section: "billing",
	},
	{
		slug: "21-buying-credits-and-stripe",
		title: "Buying credits and Stripe",
		summary: "Checkout, packs, and the billing portal.",
		section: "billing",
	},
	{
		slug: "22-subscription-tiers",
		title: "Free vs Crew Member",
		summary: "Capacity limits, invites, and owner-tier rules.",
		section: "billing",
	},
	{
		slug: "23-welcome-offer-and-promotions",
		title: "Welcome offer and promotions",
		summary: "WELCOME65 and Supply Run credit packs.",
		section: "billing",
	},
	{
		slug: "30-mcp-overview",
		title: "MCP overview",
		summary: "Connect an AI agent to your kitchen with OAuth.",
		section: "agents",
	},
	{
		slug: "31-mcp-connection-setup",
		title: "Connecting to MCP",
		summary: "Client setup steps and common OAuth failures.",
		section: "agents",
	},
	{
		slug: "32-mcp-tools-reference",
		title: "MCP tools reference",
		summary: "Tool catalog and rate-limit categories.",
		section: "agents",
	},
	{
		slug: "33-mcp-vs-web-app",
		title: "MCP vs web app",
		summary: "What agents can and cannot do compared to the hub.",
		section: "agents",
	},
	{
		slug: "34-rest-api-v1-overview",
		title: "REST API (v1) overview",
		summary: "API keys, scopes, and import/export endpoints.",
		section: "agents",
	},
	{
		slug: "40-security-overview",
		title: "Security overview",
		summary: "Auth, isolation, rate limits, and Copilot posture.",
		section: "security",
	},
	{
		slug: "41-data-and-privacy",
		title: "Data, privacy, and deletion",
		summary: "Where legal policies live and what purge removes.",
		section: "security",
	},
	{
		slug: "42-api-key-safety",
		title: "API key safety",
		summary: "OAuth vs keys, rotation, and storage hygiene.",
		section: "security",
	},
	{
		slug: "50-architecture-at-a-glance",
		title: "Architecture at a glance",
		summary: "D1, R2, KV, and Vectorize in plain language.",
		section: "limits",
	},
	{
		slug: "51-reliability-and-async-jobs",
		title: "Async jobs and reliability",
		summary: "Queues, refunds, and idempotent AI jobs.",
		section: "limits",
	},
	{
		slug: "52-limits-and-rate-limits",
		title: "Limits and rate limits",
		summary: "Tier caps and web/MCP throttles.",
		section: "limits",
	},
	{
		slug: "60-troubleshooting-common",
		title: "Common troubleshooting",
		summary: "Credits, wrong group, scan stuck, share blocked.",
		section: "troubleshooting",
	},
	{
		slug: "61-billing-issues",
		title: "Billing troubleshooting",
		summary: "Missing credits, portal access, and what to tell support.",
		section: "troubleshooting",
	},
];

const SLUG_SET = new Set(HELP_ARTICLES.map((a) => a.slug));

export function isHelpArticleSlug(slug: string): boolean {
	return SLUG_SET.has(slug);
}

export function getHelpArticleMeta(slug: string): HelpArticleMeta | undefined {
	return HELP_ARTICLES.find((a) => a.slug === slug);
}

export function helpArticlesBySection(
	section: HelpSectionId,
): HelpArticleMeta[] {
	return HELP_ARTICLES.filter((a) => a.section === section);
}
