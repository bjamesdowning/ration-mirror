import { data, redirect } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import {
	AccountDeletionBlockedError,
	assertAccountDeletionAllowed,
	beginAccountPurge,
	cancelStripeBeforeAccountPurge,
} from "~/lib/user-purge.server";
import type { Route } from "./+types/purge";

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const userId = user.id;
	const env = context.cloudflare.env;

	const rateLimitResult = await checkRateLimit(
		env.RATION_KV,
		"user_purge",
		userId,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Account deletion is rate limited. Please try again later.",
		);
	}

	try {
		const { email, stripeCustomerId } = await assertAccountDeletionAllowed(
			env,
			userId,
		);

		// Stripe first — while the user can still recover if cancel fails.
		await cancelStripeBeforeAccountPurge(env, stripeCustomerId);

		await beginAccountPurge(env, context.cloudflare.ctx, {
			userId,
			email,
			stripeCustomerId,
		});
	} catch (error) {
		if (error instanceof AccountDeletionBlockedError) {
			throw data(
				{
					error: error.message,
					code: error.code,
					eligibility: error.eligibility,
				},
				{ status: 409 },
			);
		}
		return handleApiError(error);
	}

	return redirect("/");
}
