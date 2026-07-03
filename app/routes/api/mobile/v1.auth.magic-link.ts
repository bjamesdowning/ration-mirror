import { data } from "react-router";
import { getAuth } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { storeMobilePendingHandoff } from "~/lib/mobile/pending-handoff.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MobileMagicLinkSchema } from "~/lib/schemas/mobile/auth";
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
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	try {
		const body = await request.json();
		const { email, codeChallenge } = MobileMagicLinkSchema.parse(body);
		const auth = getAuth(context.cloudflare.env);
		const baseUrl = context.cloudflare.env.BETTER_AUTH_URL.replace(/\/$/, "");
		const pendingId = await storeMobilePendingHandoff(
			context.cloudflare.env.RATION_KV,
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
			},
			headers: request.headers,
		});
		return { sent: true };
	} catch (e) {
		return handleApiError(e);
	}
}
