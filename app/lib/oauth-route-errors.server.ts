import { data } from "react-router";
import { oauthErrorDetail } from "./oauth-flow";
import type { OAuthFlowError } from "./oauth-orchestrator.server";
import { logOAuthFlowEvent, oauthUserMessage } from "./oauth-telemetry.server";
import type { OAuthFlowErrorCode } from "./schemas/oauth-flow";

export function oauthFlowErrorResponse(
	error: OAuthFlowError,
	flowId?: string,
): ReturnType<typeof data> {
	if (flowId) {
		logOAuthFlowEvent({
			oauthFlowId: flowId,
			step: "failed",
			outcome: "error",
			errorCode: error.code,
		});
	}
	return data(
		{
			error: oauthUserMessage(error.code),
			errorCode: error.code,
		},
		{ status: 400 },
	);
}

export function mapUnknownConsentError(
	error: unknown,
	context: { flowId?: string; clientId?: string },
): ReturnType<typeof data> {
	const detail = oauthErrorDetail(error);
	if (context.flowId) {
		logOAuthFlowEvent({
			oauthFlowId: context.flowId,
			step: "consent_presented",
			outcome: "error",
			errorCode: "consent_rejected",
			clientId: context.clientId,
			detail,
		});
	}
	return data(
		{
			error: oauthUserMessage("consent_rejected"),
			errorCode: "consent_rejected" satisfies OAuthFlowErrorCode,
		},
		{ status: 400 },
	);
}
