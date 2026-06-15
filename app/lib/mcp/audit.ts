/**
 * Structured audit logging for MCP write operations.
 *
 * Every mutating MCP tool emits one `log.info` event tagged `mcp_audit` with
 * the API-key id, user id, organization id, tool name, and outcome. Telemetry
 * pipelines (Cloudflare Workers Logs, observability MCP) can filter on
 * `event=mcp_audit` for security review and rate-limit forensics.
 *
 * Never logs raw request bodies — only stable, low-cardinality fields.
 */

import { log, redactId } from "../logging.server";
import type { McpToolContext } from "./auth";

export interface McpAuditFields {
	tool: string;
	outcome: "ok" | "error";
	errorCode?: string;
	resourceId?: string; // entity touched, e.g. cargoId, supplyItemId
	durationMs?: number;
	idempotencyKey?: string;
}

export function auditMcpWrite(
	ctx: McpToolContext,
	fields: McpAuditFields,
): void {
	log.info("mcp_audit", {
		event: "mcp_audit",
		organizationId: redactId(ctx.organizationId),
		userId: redactId(ctx.userId),
		apiKeyId: redactId(ctx.apiKeyId),
		keyPrefix: redactId(ctx.keyPrefix),
		...(ctx.delegation
			? {
					delegated: true,
					actorClientId: redactId(ctx.delegation.actorClientId),
					subjectUserId: redactId(ctx.delegation.subjectUserId),
					subjectOrganizationId: redactId(ctx.delegation.subjectOrganizationId),
				}
			: {}),
		...fields,
	});
}
