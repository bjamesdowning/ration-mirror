import { data, redirect } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { FEATURE_DISABLED_CODE } from "~/lib/feature-flags/assert-enabled.server";
import {
	buildWebFlagContext,
	isFeatureEnabled,
} from "~/lib/feature-flags/flags.server";
import {
	MobileReviewAuthError,
	verifyReviewLoginCredentials,
} from "~/lib/mobile/review-auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { WebReviewLoginSchema } from "~/lib/schemas/web-review-login";
import {
	issueWebReviewSessionCookie,
	resolveWebReviewCallback,
} from "~/lib/web-review-session.server";
import type { Route } from "./+types/auth.review-login";

function formString(value: FormDataEntryValue | null): string | undefined {
	return typeof value === "string" ? value : undefined;
}

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

	const flagContext = buildWebFlagContext(request, env);
	if (!(await isFeatureEnabled(env, "app-review-login", flagContext))) {
		return data(
			{
				error: "This feature is temporarily unavailable.",
				code: FEATURE_DISABLED_CODE,
			},
			{ status: 403 },
		);
	}

	try {
		const form = await request.formData();
		const input = WebReviewLoginSchema.parse({
			email: formString(form.get("email")),
			password: formString(form.get("password")),
			callbackURL: formString(form.get("callbackURL")),
		});

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

		const { userId } = await verifyReviewLoginCredentials(env, input);
		const cookie = await issueWebReviewSessionCookie(env, userId, request);
		const headers = new Headers();
		headers.append("Set-Cookie", cookie);
		return redirect(resolveWebReviewCallback(input.callbackURL, request), {
			headers,
		});
	} catch (e) {
		if (e instanceof MobileReviewAuthError) {
			return data({ error: e.message, code: e.code }, { status: e.status });
		}
		return handleApiError(e);
	}
}
