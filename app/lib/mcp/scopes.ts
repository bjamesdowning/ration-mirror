/**
 * Fine-grained MCP scope vocabulary.
 *
 * Existing keys with the broad `mcp` scope continue to work as before — `mcp`
 * implies all `mcp:*` scopes. New keys can be created with narrow scopes for
 * least-privilege access.
 */

import type { McpToolContext } from "./auth";

export const MCP_SCOPES = [
	"mcp", // legacy: full access
	"mcp:read",
	"mcp:inventory:write",
	"mcp:galley:write",
	"mcp:manifest:write",
	"mcp:supply:write",
	"mcp:preferences:write",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

/** Error thrown when a tool requires a scope the caller does not have. */
export class McpScopeError extends Error {
	override name = "McpScopeError" as const;
	required: McpScope;
	constructor(required: McpScope) {
		super(`Insufficient scope: requires '${required}'`);
		this.required = required;
	}
}

/**
 * Throws `McpScopeError` if the context does not satisfy any of the required
 * scopes. Legacy `mcp` scope satisfies any narrow scope.
 */
export function requireScope(ctx: McpToolContext, needed: McpScope[]): void {
	const hasLegacy = ctx.scopes.includes("mcp");
	if (hasLegacy) return;
	for (const s of needed) {
		if (!ctx.scopes.includes(s)) {
			throw new McpScopeError(s);
		}
	}
}

/** Check (without throwing) whether the context satisfies the required scope. */
export function hasScope(ctx: McpToolContext, needed: McpScope): boolean {
	if (ctx.scopes.includes("mcp")) return true;
	return ctx.scopes.includes(needed);
}
