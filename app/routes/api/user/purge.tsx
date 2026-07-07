import { redirect } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { handleApiError, retryOnD1Contention } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { purgeUserAccount } from "~/lib/user-purge.server";
import type { Route } from "./+types/purge";

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const userId = user.id;

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
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
		await retryOnD1Contention(() =>
			purgeUserAccount(context.cloudflare.env, {
				userId,
				email: user.email,
			}),
		);
	} catch (error) {
		log.error("[Purge] account deletion failed", {
			userId: redactId(userId),
			errorMessage: error instanceof Error ? error.message : String(error),
		});
		return handleApiError(error);
	}

	return redirect("/");
}
