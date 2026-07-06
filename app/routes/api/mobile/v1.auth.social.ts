import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import {
	authenticateMobileSocial,
	MobileSocialAuthError,
} from "~/lib/mobile/social-auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MobileSocialAuthSchema } from "~/lib/schemas/mobile/auth";
import type { Route } from "./+types/v1.auth.social";

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
		const input = MobileSocialAuthSchema.parse(body);
		return await authenticateMobileSocial(context.cloudflare.env, input);
	} catch (e) {
		if (e instanceof MobileSocialAuthError) {
			throw data({ error: e.message, code: e.code }, { status: e.status });
		}
		return handleApiError(e);
	}
}
