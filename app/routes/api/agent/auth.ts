import { data } from "react-router";
import { getClientIp } from "~/lib/agent/claim.server";
import { provisionAgentUser } from "~/lib/agent/provision.server";
import { handleApiError } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { agentAnonRegisterSchema } from "~/lib/schemas/agent-auth";
import type { Route } from "./+types/auth";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405 });
	}

	const env = context.cloudflare.env;

	try {
		const clientIp = getClientIp(request);
		const rateLimit = await checkRateLimit(
			env.RATION_KV,
			"agent_auth_register",
			clientIp,
		);
		if (!rateLimit.allowed) {
			return rateLimitResponse(rateLimit, "Too many registration attempts");
		}

		const body = await request.json();
		const parsed = agentAnonRegisterSchema.parse(body);

		const result = await provisionAgentUser(env, {
			request,
			clientHint: parsed.client_hint,
		});

		log.info("[AgentAuth] Anonymous registration", {
			event: "agent_auth_register",
			userId: redactId(result.userId),
			organizationId: redactId(result.organizationId),
			registrationId: redactId(result.registrationId),
		});

		return {
			api_key: result.apiKey.key,
			claim_token: result.claimToken,
			claim_url: result.claimUrl,
			organization_id: result.organizationId,
			mcp_endpoint: result.mcpEndpoint,
			scopes: [...result.scopes],
			docs: {
				auth_md: new URL("/auth.md", request.url).toString(),
				connect: new URL("/connect", request.url).toString(),
			},
		};
	} catch (error) {
		return handleApiError(error);
	}
}
