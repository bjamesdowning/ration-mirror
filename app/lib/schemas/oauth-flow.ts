import { z } from "zod";

export const oauthFlowErrorCodeSchema = z.enum([
	"flow_expired",
	"flow_invalid",
	"flow_step_mismatch",
	"flow_user_mismatch",
	"consent_rejected",
	"org_required",
	"not_member",
	"client_unknown",
	"missing_oauth_query",
	"redirect_missing",
]);

export type OAuthFlowErrorCode = z.infer<typeof oauthFlowErrorCodeSchema>;
