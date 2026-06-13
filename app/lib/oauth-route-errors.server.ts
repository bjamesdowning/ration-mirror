import { data } from "react-router";
import { oauthErrorDetail } from "./oauth-query.server";
import { logOAuthFlowEvent, oauthUserMessage } from "./oauth-telemetry.server";
import type { OAuthFlowErrorCode } from "./schemas/oauth-flow";

export function oauthErrorResponse(
	errorCode: OAuthFlowErrorCode,
	options?: {
		step?: "sign_in" | "select_org" | "consent";
		clientId?: string;
		correlationId?: string;
	},
): ReturnType<typeof data> {
	if (options?.step) {
		logOAuthFlowEvent({
			step: options.step,
			outcome: "error",
			errorCode,
			clientId: options.clientId,
			correlationId: options.correlationId,
		});
	}
	return data(
		{
			error: oauthUserMessage(errorCode),
			errorCode,
		},
		{ status: 400 },
	);
}

type ConsentErrorMapping = {
	error: string;
	errorCode: OAuthFlowErrorCode;
};

/** Map Better Auth / oauth2Consent failures to actionable UI messages. */
export function mapBetterAuthConsentError(error: unknown): ConsentErrorMapping {
	const detail = oauthErrorDetail(error).toLowerCase();

	if (
		detail.includes("invalid_signature") ||
		detail.includes("invalid signature") ||
		detail.includes("unauthorized") ||
		detail.includes("forbidden")
	) {
		return {
			error:
				"This authorization link expired or is invalid. Restart the connection from your AI client.",
			errorCode: "flow_invalid",
		};
	}

	if (
		detail.includes("missing oauth query") ||
		detail.includes("missing oauth_query")
	) {
		return {
			error: oauthUserMessage("missing_oauth_query"),
			errorCode: "missing_oauth_query",
		};
	}

	if (
		detail.includes("missing parameters") ||
		detail.includes("scope not originally requested") ||
		detail.includes("invalid_request")
	) {
		return {
			error:
				"Permission selection did not match the original request. Restart the connection from your AI client.",
			errorCode: "flow_invalid",
		};
	}

	if (detail.includes("redirect") && detail.includes("invalid")) {
		return {
			error: oauthUserMessage("redirect_missing"),
			errorCode: "redirect_missing",
		};
	}

	return {
		error: oauthUserMessage("consent_rejected"),
		errorCode: "consent_rejected",
	};
}

export function mapUnknownConsentError(
	error: unknown,
	context: {
		step?: "select_org" | "consent";
		clientId?: string;
		correlationId?: string;
	},
): ReturnType<typeof data> {
	const mapped = mapBetterAuthConsentError(error);
	const detail = oauthErrorDetail(error);
	if (context.step) {
		logOAuthFlowEvent({
			step: context.step,
			outcome: "error",
			errorCode: mapped.errorCode,
			clientId: context.clientId,
			correlationId: context.correlationId,
			detail,
		});
	}
	return data(
		{
			error: mapped.error,
			errorCode: mapped.errorCode,
		},
		{ status: 400 },
	);
}
