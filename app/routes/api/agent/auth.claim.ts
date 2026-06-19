import { waitUntil } from "cloudflare:workers";
import { data } from "react-router";
import {
	findRegistrationByClaimToken,
	generateOtp,
	getClientIp,
	isRegistrationClaimable,
	storeClaimOtp,
} from "~/lib/agent/claim.server";
import {
	buildClaimOtpEmail,
	sendEmail,
	shouldSkipEmailSend,
} from "~/lib/email.server";
import { handleApiError } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { agentClaimStartSchema } from "~/lib/schemas/agent-auth";
import type { Route } from "./+types/auth.claim";

const GENERIC_OK = {
	ok: true,
	stage: "otp_sent" as const,
	message:
		"If the claim token is valid, a verification code has been sent to your email.",
};

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405 });
	}

	const env = context.cloudflare.env;

	try {
		const clientIp = getClientIp(request);
		const ipLimit = await checkRateLimit(
			env.RATION_KV,
			"agent_auth_claim",
			clientIp,
		);
		if (!ipLimit.allowed) {
			return data(
				{ error: "Too many requests" },
				{
					status: 429,
					headers: { "Retry-After": String(ipLimit.retryAfter ?? 60) },
				},
			);
		}

		const body = await request.json();
		const parsed = agentClaimStartSchema.parse(body);

		const emailLimit = await checkRateLimit(
			env.RATION_KV,
			"agent_auth_claim",
			`email:${parsed.email.toLowerCase()}`,
		);
		if (!emailLimit.allowed) {
			return GENERIC_OK;
		}

		const registration = await findRegistrationByClaimToken(
			env,
			parsed.claim_token,
		);

		if (!registration || !isRegistrationClaimable(registration)) {
			return GENERIC_OK;
		}

		const otp = generateOtp();
		await storeClaimOtp(env, registration.id, parsed.email, otp);

		if (!shouldSkipEmailSend(env)) {
			const { html, text } = buildClaimOtpEmail(otp);
			const emailPromise = sendEmail(env.EMAIL, {
				to: parsed.email,
				subject: "Verify your Ration agent kitchen",
				html,
				text,
			}).catch((err) => {
				log.error("[AgentClaim] Failed to send OTP email", {
					message: err instanceof Error ? err.message : String(err),
					registrationId: redactId(registration.id),
				});
			});
			waitUntil(emailPromise);
		}

		log.info("[AgentClaim] OTP sent", {
			event: "agent_auth_claim",
			registrationId: redactId(registration.id),
		});

		return GENERIC_OK;
	} catch (error) {
		return handleApiError(error);
	}
}
