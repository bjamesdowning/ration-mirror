import type { ApiScope } from "~/lib/schemas/api-keys";

export const SCOPE_META: Record<
	ApiScope,
	{ label: string; description: string; color: string }
> = {
	inventory: {
		label: "Inventory",
		description: "Read & write pantry items",
		color: "bg-platinum text-carbon",
	},
	galley: {
		label: "Galley",
		description: "Read & write meals & recipes",
		color: "bg-platinum text-carbon",
	},
	supply: {
		label: "Supply",
		description: "Read & write shopping lists",
		color: "bg-platinum text-carbon",
	},
	mcp: {
		label: "MCP Legacy Full Access",
		description: "Legacy broad scope that grants all MCP permissions",
		color: "bg-hyper-green/20 text-hyper-green border border-hyper-green/30",
	},
	"mcp:read": {
		label: "MCP Read (advanced)",
		description: "Manual MCP auth: read-only access across MCP tools",
		color: "bg-hyper-green/20 text-hyper-green border border-hyper-green/30",
	},
	"mcp:inventory:write": {
		label: "MCP Inventory Write (advanced)",
		description: "Manual MCP auth: create/update/remove pantry items via MCP",
		color: "bg-hyper-green/20 text-hyper-green border border-hyper-green/30",
	},
	"mcp:galley:write": {
		label: "MCP Galley Write (advanced)",
		description: "Manual MCP auth: create/update meals and cook flows via MCP",
		color: "bg-hyper-green/20 text-hyper-green border border-hyper-green/30",
	},
	"mcp:manifest:write": {
		label: "MCP Manifest Write (advanced)",
		description: "Manual MCP auth: update meal plan entries via MCP",
		color: "bg-hyper-green/20 text-hyper-green border border-hyper-green/30",
	},
	"mcp:supply:write": {
		label: "MCP Supply Write (advanced)",
		description: "Manual MCP auth: manage shopping list items via MCP",
		color: "bg-hyper-green/20 text-hyper-green border border-hyper-green/30",
	},
	"mcp:preferences:write": {
		label: "MCP Preferences Write (advanced)",
		description:
			"Manual MCP auth: update preferences and related settings via MCP",
		color: "bg-hyper-green/20 text-hyper-green border border-hyper-green/30",
	},
};

export const DEFAULT_SCOPES: ApiScope[] = ["inventory", "galley", "supply"];
export const REST_SCOPE_ORDER: ApiScope[] = ["inventory", "galley", "supply"];
export const MCP_SCOPE_ORDER: ApiScope[] = [
	"mcp:read",
	"mcp:inventory:write",
	"mcp:galley:write",
	"mcp:manifest:write",
	"mcp:supply:write",
	"mcp:preferences:write",
	"mcp",
];

export type ScopePresetId =
	| "rest-inventory"
	| "rest-galley"
	| "rest-supply"
	| "mcp-read"
	| "mcp-kitchen-write";

export const SCOPE_PRESETS: {
	id: ScopePresetId;
	label: string;
	description: string;
	scopes: ApiScope[];
}[] = [
	{
		id: "rest-inventory",
		label: "REST: Inventory",
		description: "Cargo CSV export and import",
		scopes: ["inventory"],
	},
	{
		id: "rest-galley",
		label: "REST: Galley",
		description: "Recipe JSON export and import",
		scopes: ["galley"],
	},
	{
		id: "rest-supply",
		label: "REST: Supply",
		description: "Shopping list CSV export",
		scopes: ["supply"],
	},
	{
		id: "mcp-read",
		label: "MCP: Read-only",
		description: "Read-only MCP tools",
		scopes: ["mcp:read"],
	},
	{
		id: "mcp-kitchen-write",
		label: "MCP: Kitchen write",
		description: "Full kitchen MCP without legacy mcp scope",
		scopes: [
			"mcp:read",
			"mcp:inventory:write",
			"mcp:galley:write",
			"mcp:manifest:write",
			"mcp:supply:write",
			"mcp:preferences:write",
		],
	},
];

/** Match a preset when scopes are an exact set match. */
export function findMatchingPreset(scopes: ApiScope[]): ScopePresetId | null {
	const sorted = [...scopes].sort().join(",");
	const match = SCOPE_PRESETS.find(
		(p) => [...p.scopes].sort().join(",") === sorted,
	);
	return match?.id ?? null;
}
