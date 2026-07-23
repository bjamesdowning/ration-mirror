/**
 * Lightweight MCP/Copilot efficiency metrics (structured logs).
 * Track latency, timeouts, and workflow outcomes without PII.
 */

import { log } from "../logging.server";

export type McpToolMetricEvent =
	| {
			type: "tool_complete";
			tool: string;
			ok: boolean;
			durationMs: number;
			errorCode?: string;
	  }
	| {
			type: "tool_timeout";
			tool: string;
			durationMs: number;
	  };

export function recordMcpToolMetric(event: McpToolMetricEvent): void {
	log.info("[mcp.metric]", event as unknown as Record<string, unknown>);
}
