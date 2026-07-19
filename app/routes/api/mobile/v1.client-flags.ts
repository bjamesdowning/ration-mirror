import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import {
	buildFlagContext,
	getClientSafeFlags,
} from "~/lib/feature-flags/flags.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.client-flags";

/**
 * Unsigned client-visible Flagship flags for signed-out surfaces (e.g. Sign In).
 * Authenticated clients should prefer `GET /session` which includes the same map.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	if (request.method !== "GET") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const env = context.cloudflare.env;
	const ip =
		request.headers.get("CF-Connecting-IP") ??
		request.headers.get("X-Forwarded-For") ??
		"unknown";

	const rateLimitResult = await checkRateLimit(
		env.RATION_KV,
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
		const flagContext = buildFlagContext(request, env);
		const clientFlags = await getClientSafeFlags(env, flagContext);
		return { clientFlags };
	} catch (e) {
		return handleApiError(e);
	}
}
