import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import {
	claimOnStubUser,
	findRegistrationByClaimToken,
	isRegistrationClaimable,
	mergeAgentIntoUser,
	verifyClaimOtp,
} from "~/lib/agent/claim.server";
import { AGENT_API_KEY_SCOPES } from "~/lib/agent/scopes";
import { handleApiError } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { agentClaimCompleteSchema } from "~/lib/schemas/agent-auth";
import type { Route } from "./+types/auth.claim.complete";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405 });
	}

	const env = context.cloudflare.env;

	try {
		const body = await request.json();
		const parsed = agentClaimCompleteSchema.parse(body);

		const tokenLimit = await checkRateLimit(
			env.RATION_KV,
			"agent_auth_claim_complete",
			parsed.claim_token.slice(0, 32),
		);
		if (!tokenLimit.allowed) {
			return data(
				{ error: "Too many verification attempts" },
				{
					status: 429,
					headers: { "Retry-After": String(tokenLimit.retryAfter ?? 300) },
				},
			);
		}

		const registration = await findRegistrationByClaimToken(
			env,
			parsed.claim_token,
		);

		if (!registration || !isRegistrationClaimable(registration)) {
			return data({ error: "Invalid or expired claim token" }, { status: 400 });
		}

		const otpResult = await verifyClaimOtp(
			env,
			registration.id,
			parsed.email,
			parsed.otp,
		);

		if (!otpResult.ok) {
			return data({ error: "Invalid verification code" }, { status: 400 });
		}

		const db = drizzle(env.DB, { schema });
		const email = parsed.email.toLowerCase();

		const existingUser = await db.query.user.findFirst({
			where: eq(schema.user.email, email),
		});

		let result: { organizationId: string; merged: boolean };

		if (existingUser && existingUser.id !== registration.userId) {
			result = await mergeAgentIntoUser(env, {
				registration,
				stubUserId: registration.userId,
				stubOrgId: registration.organizationId,
				canonicalUserId: existingUser.id,
				email,
			});
		} else {
			result = await claimOnStubUser(env, {
				registration,
				stubUserId: registration.userId,
				email,
			});
		}

		log.info("[AgentClaim] Claim complete", {
			event: "agent_auth_claim_complete",
			registrationId: redactId(registration.id),
			merged: result.merged,
			organizationId: redactId(result.organizationId),
		});

		return {
			ok: true,
			stage: "claim_complete" as const,
			merged: result.merged,
			organization_id: result.organizationId,
			scopes: [...AGENT_API_KEY_SCOPES],
		};
	} catch (error) {
		return handleApiError(error);
	}
}
