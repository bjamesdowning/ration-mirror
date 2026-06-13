import { log, redactId } from "./logging.server";
import type { OAuthFlowErrorCode } from "./schemas/oauth-flow";

export const OAUTH_USER_MESSAGES: Record<OAuthFlowErrorCode, string> = {
	flow_expired:
		"This authorization request expired. Remove the MCP server in your AI client, add it again, and complete sign-in in one browser tab within a few minutes.",
	flow_invalid:
		"This authorization link is invalid. Restart the connection from your AI client.",
	flow_step_mismatch:
		"This authorization step is out of order. Restart the connection from your AI client.",
	flow_user_mismatch:
		"This authorization session belongs to another account. Sign out and try again, or restart from your AI client.",
	consent_rejected:
		"Authorization was not granted. Remove the MCP server in your AI client, re-add the URL, and click Authorize (not Deny) after sign-in and household selection.",
	org_required: "Select a household before authorizing this agent.",
	not_member: "You are not a member of that household.",
	client_unknown:
		"This AI client is no longer registered. Remove and re-add the MCP server in your client.",
	missing_oauth_query:
		"Missing authorization session. Restart the connection from your AI client.",
	redirect_missing:
		"Unable to complete authorization. Restart the connection from your AI client.",
};

export function oauthUserMessage(code: OAuthFlowErrorCode): string {
	return OAUTH_USER_MESSAGES[code];
}

export type OAuthFlowLogStep = "sign_in" | "select_org" | "consent" | "failed";

export type OAuthFlowLogOutcome = "success" | "error";

export function logOAuthFlowEvent(input: {
	step: OAuthFlowLogStep;
	outcome: OAuthFlowLogOutcome;
	errorCode?: OAuthFlowErrorCode;
	clientId?: string;
	correlationId?: string;
	durationMs?: number;
	detail?: string;
}): void {
	log.info("oauth_flow", {
		event: "oauth_flow",
		step: input.step,
		outcome: input.outcome,
		...(input.errorCode ? { error_code: input.errorCode } : {}),
		...(input.clientId ? { client_id_redacted: redactId(input.clientId) } : {}),
		...(input.correlationId
			? { correlation_id: redactId(input.correlationId) }
			: {}),
		...(input.durationMs !== undefined
			? { duration_ms: input.durationMs }
			: {}),
		...(input.detail ? { detail: input.detail.slice(0, 200) } : {}),
	});
}

/** Structured MCP resource-server token verification failure (no secrets). */
export function logMcpOAuthVerifyFailure(input: {
	errorCode: string;
	correlationId?: string;
	clientId?: string;
}): void {
	log.warn("mcp_oauth_verify_failed", {
		event: "mcp_oauth_verify_failed",
		error_code: input.errorCode,
		...(input.correlationId
			? { correlation_id: redactId(input.correlationId) }
			: {}),
		...(input.clientId ? { client_id_redacted: redactId(input.clientId) } : {}),
	});
}
