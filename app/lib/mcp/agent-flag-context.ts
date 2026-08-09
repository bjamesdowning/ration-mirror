/**
 * Resolve agent Flagship context from MCP tool auth context.
 */

import {
	type AgentFlagPlatform,
	buildAgentFlagContext,
	type FlagshipEvaluationContext,
} from "~/lib/feature-flags/context.server";
import type { McpToolContext } from "./auth";

export function resolveAgentSurface(ctx: McpToolContext): AgentFlagPlatform {
	return ctx.agentSurface === "copilot" ? "copilot" : "mcp";
}

export function resolveAgentFlagContext(
	env: { RATION_ENV?: string },
	ctx: McpToolContext,
): FlagshipEvaluationContext {
	return buildAgentFlagContext(env, ctx.userId, resolveAgentSurface(ctx));
}
