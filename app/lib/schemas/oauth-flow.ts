import { z } from "zod";

export const OAUTH_FLOW_RECORD_VERSION = 1 as const;
export const OAUTH_FLOW_TTL_SEC = 600;

export const oauthFlowStepSchema = z.enum([
	"initiated",
	"authenticated",
	"org_selected",
	"consent_presented",
	"completed",
	"failed",
	"expired",
]);

export type OAuthFlowStep = z.infer<typeof oauthFlowStepSchema>;

export const oauthFlowRecordSchema = z.object({
	flowId: z.string().uuid(),
	step: oauthFlowStepSchema,
	oauthQueryDigest: z.string().min(64).max(64),
	clientId: z.string().min(1),
	requestedScopes: z.array(z.string()),
	userId: z.string().optional(),
	organizationId: z.string().optional(),
	createdAt: z.number().int().positive(),
	expiresAt: z.number().int().positive(),
	version: z.literal(OAUTH_FLOW_RECORD_VERSION),
});

export type OAuthFlowRecord = z.infer<typeof oauthFlowRecordSchema>;

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

export const oauthFlowIdParamSchema = z.string().uuid();
