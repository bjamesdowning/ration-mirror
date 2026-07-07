import { data } from "react-router";
import { getClientIp } from "~/lib/agent/claim.server";
import {
	ClaimReissueError,
	reissueClaimToken,
} from "~/lib/agent/claim-reissue.server";
import { AGENT_API_KEY_SCOPES } from "~/lib/agent/scopes";
import { verifyApiKey } from "~/lib/api-key.server";
import { handleApiError } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/auth.claim.reissue";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405 });
	}

	const env = context.cloudflare.env;

	try {
		const authHeader = request.headers.get("Authorization");
		const xApiKey = request.headers.get("X-Api-Key");
		const rawKey = xApiKey ?? authHeader?.replace(/^Bearer\s+/i, "").trim();

		if (!rawKey) {
			return data({ error: "Missing API key" }, { status: 401 });
		}

		const record = await verifyApiKey(env.DB, rawKey);
		if (!record) {
			return data({ error: "Invalid API key" }, { status: 401 });
		}

		const rateLimit = await checkRateLimit(
			env.RATION_KV,
			"agent_auth_claim_reissue",
			record.keyPrefix,
		);
		if (!rateLimit.allowed) {
			return rateLimitResponse(rateLimit, "Too many reissue requests");
		}

		const ipLimit = await checkRateLimit(
			env.RATION_KV,
			"agent_auth_claim_reissue",
			getClientIp(request),
		);
		if (!ipLimit.allowed) {
			return rateLimitResponse(ipLimit, "Too many requests");
		}

		const result = await reissueClaimToken(env, record, request);

		log.info("[AgentClaim] Reissued claim token", {
			event: "agent_auth_claim_reissue",
			registrationOrg: redactId(record.organizationId),
		});

		return {
			claim_token: result.claimToken,
			claim_url: result.claimUrl,
			claim_token_expires_at: result.claimTokenExpiresAt.toISOString(),
			scopes: [...AGENT_API_KEY_SCOPES],
		};
	} catch (error) {
		if (error instanceof ClaimReissueError) {
			return data({ error: error.message }, { status: 403 });
		}
		return handleApiError(error);
	}
}
