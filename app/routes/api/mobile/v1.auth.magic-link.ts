import { data } from "react-router";
import { getAuth } from "~/lib/auth.server";
import { assertExistingUserForSignIn } from "~/lib/auth-sign-in-guard.server";
import { handleApiError } from "~/lib/error-handler";
import { storeMobilePendingHandoff } from "~/lib/mobile/pending-handoff.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MobileMagicLinkSchema } from "~/lib/schemas/mobile/auth";
import {
	clearSignupIntentForEmail,
	putSignupIntentForEmail,
} from "~/lib/tos-signup-intent.server";
import type { Route } from "./+types/v1.auth.magic-link";

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
		"auth_public",
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
		const parsed = MobileMagicLinkSchema.parse(body);
		const { email, codeChallenge, intent } = parsed;
		const env = context.cloudflare.env;

		if (intent === "signIn") {
			// Refuse unknown emails before handoff / email send (matches social Sign In).
			await assertExistingUserForSignIn(env.DB, email);
			await clearSignupIntentForEmail(env.RATION_KV, email);
		} else {
			await putSignupIntentForEmail(env.RATION_KV, email);
		}

		const auth = getAuth(env);
		const baseUrl = env.BETTER_AUTH_URL.replace(/\/$/, "");
		const pendingId = await storeMobilePendingHandoff(
			env.RATION_KV,
			codeChallenge,
		);
		// Keep callbackURL short — PKCE challenge lives in KV until mobile-callback.
		const callbackURL = `${baseUrl}/auth/mobile-callback?client=ios&pending=${encodeURIComponent(pendingId)}`;
		const errorCallbackURL = `${baseUrl}/auth/verify`;
		await auth.api.signInMagicLink({
			body: {
				email,
				callbackURL,
				errorCallbackURL,
				...(intent === "signUp"
					? {
							metadata: {
								requestSignUp: true,
								tosAccepted: true,
							},
						}
					: {}),
			},
			headers: request.headers,
		});
		return { sent: true };
	} catch (e) {
		return handleApiError(e);
	}
}
