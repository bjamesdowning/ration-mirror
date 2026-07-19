import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { FEATURE_DISABLED_CODE } from "~/lib/feature-flags/assert-enabled.server";
import {
	buildFlagContext,
	isFeatureEnabled,
} from "~/lib/feature-flags/flags.server";
import {
	authenticateMobileReviewLogin,
	MobileReviewAuthError,
} from "~/lib/mobile/review-auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MobileReviewLoginSchema } from "~/lib/schemas/mobile/auth";
import type { Route } from "./+types/v1.auth.review-login";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const env = context.cloudflare.env;
	const ip =
		request.headers.get("CF-Connecting-IP") ??
		request.headers.get("X-Forwarded-For") ??
		"unknown";

	const rateLimitResult = await checkRateLimit(
		env.RATION_KV,
		"auth_review_login",
		ip,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many requests. Please try again later.",
		);
	}

	const flagContext = buildFlagContext(request, env);
	if (!(await isFeatureEnabled(env, "app-review-login", flagContext))) {
		throw data(
			{
				error: "This feature is temporarily unavailable.",
				code: FEATURE_DISABLED_CODE,
			},
			{ status: 403 },
		);
	}

	try {
		const body = await request.json();
		const input = MobileReviewLoginSchema.parse(body);

		const accountLimit = await checkRateLimit(
			env.RATION_KV,
			"auth_review_login_account",
			input.email.trim().toLowerCase(),
		);
		if (!accountLimit.allowed) {
			throw rateLimitResponse(
				accountLimit,
				"Too many requests. Please try again later.",
			);
		}

		return await authenticateMobileReviewLogin(env, input);
	} catch (e) {
		if (e instanceof MobileReviewAuthError) {
			throw data({ error: e.message, code: e.code }, { status: e.status });
		}
		return handleApiError(e);
	}
}
