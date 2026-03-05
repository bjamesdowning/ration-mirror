/**
 * GET /api/meals/import/status/:requestId
 * Poll endpoint for import-URL job status. D1-backed for strong consistency.
 */
import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	NO_STORE,
	parseJobResultJson,
	requireQueueJobForStatus,
} from "~/lib/queue-status-loader.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/meals.import.status.$requestId";

export async function loader({ params, request, context }: Route.LoaderArgs) {
	const { session } = await requireActiveGroup(context, request);
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"status_poll",
		session.user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many status poll requests. Please try again later.",
				retryAfter: rateLimitResult.retryAfter,
				resetAt: rateLimitResult.resetAt,
			},
			{
				status: 429,
				headers: {
					...NO_STORE,
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	const { job } = await requireQueueJobForStatus({ params, request, context });

	if (job.status === "pending") {
		return data(
			{ status: "pending", organizationId: job.organizationId },
			{ headers: NO_STORE },
		);
	}

	const result = parseJobResultJson<{
		status: "completed" | "failed";
		success?: boolean;
		meal?: { id: string; name: string };
		extractedRecipe?: unknown;
		sourceUrl?: string;
		code?: string;
		error?: string;
		existingMealId?: string;
		existingMealName?: string;
	}>(job.resultJson);

	return data(
		{
			status: result.status,
			success: result.success,
			meal: result.meal,
			extractedRecipe: result.extractedRecipe,
			sourceUrl: result.sourceUrl,
			code: result.code,
			error: result.error,
			existingMealId: result.existingMealId,
			existingMealName: result.existingMealName,
		},
		{ headers: NO_STORE },
	);
}
