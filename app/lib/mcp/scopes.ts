/**
 * Fine-grained MCP scope vocabulary.
 *
 * Legacy blanket `mcp` expands only to the pre-nutrition kitchen scope set. It
 * never satisfies personal nutrition scopes; those require explicit grant.
 */

import type { McpToolContext } from "./auth";

export const MCP_SCOPES = [
	"mcp", // legacy: pre-nutrition kitchen access only
	"mcp:read",
	"mcp:inventory:write",
	"mcp:galley:write",
	"mcp:manifest:write",
	"mcp:supply:write",
	"mcp:preferences:write",
	"mcp:nutrition:read",
	"mcp:nutrition:write",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

/** Scopes implied by legacy blanket `mcp` (never includes nutrition). */
export const LEGACY_MCP_EXPANDED_SCOPES = [
	"mcp:read",
	"mcp:inventory:write",
	"mcp:galley:write",
	"mcp:manifest:write",
	"mcp:supply:write",
	"mcp:preferences:write",
] as const satisfies readonly McpScope[];

const NUTRITION_SCOPES = new Set<McpScope>([
	"mcp:nutrition:read",
	"mcp:nutrition:write",
]);

/** Error thrown when a tool requires a scope the caller does not have. */
export class McpScopeError extends Error {
	override name = "McpScopeError" as const;
	required: McpScope;
	constructor(required: McpScope) {
		super(`Insufficient scope: requires '${required}'`);
		this.required = required;
	}
}

export function expandLegacyMcpScopes(
	scopes: readonly string[],
): readonly string[] {
	if (!scopes.includes("mcp")) return scopes;
	const next = new Set(scopes);
	next.delete("mcp");
	for (const scope of LEGACY_MCP_EXPANDED_SCOPES) {
		next.add(scope);
	}
	return [...next];
}

/**
 * Throws `McpScopeError` unless the context satisfies ALL of the listed scopes
 * (AND semantics). Legacy `mcp` satisfies pre-nutrition scopes only.
 */
export function requireScope(ctx: McpToolContext, needed: McpScope[]): void {
	for (const scope of needed) {
		if (!hasScope(ctx, scope)) {
			throw new McpScopeError(scope);
		}
	}
}

/** Check (without throwing) whether the context satisfies the required scope. */
export function hasScope(ctx: McpToolContext, needed: McpScope): boolean {
	if (ctx.scopes.includes(needed)) return true;
	if (NUTRITION_SCOPES.has(needed)) return false;
	return ctx.scopes.includes("mcp");
}
