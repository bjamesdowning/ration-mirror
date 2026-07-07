import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { verifyPkceChallenge } from "~/lib/mobile/pkce";
import {
	consumeMobileAuthCode,
	issueMobileTokenPair,
	rotateMobileRefreshToken,
} from "~/lib/mobile/token.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MobileTokenRequestSchema } from "~/lib/schemas/mobile/auth";
import type { Route } from "./+types/v1.auth.token";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const ip =
		request.headers.get("CF-Connecting-IP") ??
		request.headers.get("X-Forwarded-For") ??
		"unknown";
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"oauth_token",
		ip,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many requests. Please try again later.",
		);
	}

	try {
		const body = await request.json();
		const input = MobileTokenRequestSchema.parse(body);
		const env = context.cloudflare.env;

		if (input.grantType === "authorization_code") {
			const claims = await consumeMobileAuthCode(env.RATION_KV, input.code);
			if (!claims) {
				throw data(
					{ error: "Invalid or expired code", code: "invalid_code" },
					{ status: 400 },
				);
			}
			const pkceValid = await verifyPkceChallenge(
				input.codeVerifier,
				claims.codeChallenge,
			);
			if (!pkceValid) {
				throw data(
					{ error: "Invalid code verifier", code: "invalid_grant" },
					{ status: 400 },
				);
			}
			const tokens = await issueMobileTokenPair(
				env,
				claims.userId,
				claims.organizationId,
			);
			return tokens;
		}

		const tokens = await rotateMobileRefreshToken(env, input.refreshToken);
		return tokens;
	} catch (e) {
		if (e instanceof Error && e.message === "invalid_refresh_token") {
			throw data(
				{ error: "Invalid refresh token", code: "invalid_refresh_token" },
				{ status: 401 },
			);
		}
		return handleApiError(e);
	}
}
