import { log, redactId } from "./logging.server";
import type { OAuthFlowErrorCode, OAuthFlowStep } from "./schemas/oauth-flow";

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
		"This authorization request could not be completed. Restart the connection from your AI client and try again.",
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

export type OAuthFlowLogOutcome = "success" | "error";

export function logOAuthFlowEvent(input: {
	oauthFlowId: string;
	step: OAuthFlowStep;
	outcome: OAuthFlowLogOutcome;
	errorCode?: OAuthFlowErrorCode;
	clientId?: string;
	durationMs?: number;
	detail?: string;
}): void {
	log.info("oauth_flow", {
		event: "oauth_flow",
		oauth_flow_id: input.oauthFlowId,
		step: input.step,
		outcome: input.outcome,
		...(input.errorCode ? { error_code: input.errorCode } : {}),
		...(input.clientId ? { client_id_redacted: redactId(input.clientId) } : {}),
		...(input.durationMs !== undefined
			? { duration_ms: input.durationMs }
			: {}),
		...(input.detail ? { detail: input.detail.slice(0, 200) } : {}),
	});
}
