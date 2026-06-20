import { z } from "zod";
import { AGENT_API_KEY_SCOPES } from "../agent/scopes";

const mcpScopeEnum = z.enum(AGENT_API_KEY_SCOPES);

/** POST /api/agent/auth — anonymous registration response (shown once). */
export const AgentAnonRegisterResponseSchema = z.object({
	api_key: z
		.string()
		.describe("One-time API key — store securely; not retrievable later"),
	claim_token: z.string(),
	claim_url: z.string().url(),
	organization_id: z.string(),
	mcp_endpoint: z.string().url(),
	scopes: z.array(mcpScopeEnum),
	docs: z.object({
		auth_md: z.string().url(),
		connect: z.string().url(),
	}),
});

/** POST /api/agent/auth/claim — start claim (OTP email). */
export const AgentClaimStartResponseSchema = z.object({
	ok: z.literal(true),
	stage: z.literal("otp_sent"),
	message: z.string(),
});

/** POST /api/agent/auth/claim/complete — claim success. */
export const AgentClaimCompleteResponseSchema = z.object({
	ok: z.literal(true),
	stage: z.literal("claim_complete"),
	merged: z.boolean(),
	organization_id: z.string(),
	scopes: z.array(mcpScopeEnum),
});

/** POST /api/agent/auth/claim/reissue — new claim URL for agent key holder. */
export const AgentClaimReissueResponseSchema = z.object({
	claim_token: z.string(),
	claim_url: z.string().url(),
	claim_token_expires_at: z.string().datetime(),
	scopes: z.array(mcpScopeEnum),
});

/** Shared v1 import success envelope. */
export const V1ImportSuccessSchema = z.object({
	success: z.literal(true),
	imported: z.number().int().nonnegative(),
	updated: z.number().int().nonnegative(),
	errors: z.array(z.string()).optional(),
	warnings: z.array(z.string()).optional(),
});

export const ApiErrorSchema = z.object({
	error: z.string(),
	retryAfter: z.number().int().optional(),
});
