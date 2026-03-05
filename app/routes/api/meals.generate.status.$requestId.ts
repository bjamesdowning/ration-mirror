/**
 * GET /api/meals/generate/status/:requestId
 * Poll endpoint for meal generation job status. D1-backed for strong consistency.
 */
import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	NO_STORE,
	parseJobResultJson,
	requireQueueJobForStatus,
} from "~/lib/queue-status-loader.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/meals.generate.status.$requestId";

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
		status: "pending" | "completed" | "failed";
		organizationId?: string;
		recipes?: Array<{
			name: string;
			description: string;
			ingredients: Array<{
				name: string;
				quantity: number;
				unit: string;
				inventoryName: string;
			}>;
			directions: string[];
			prepTime: number;
			cookTime: number;
		}>;
		error?: string;
	}>(job.resultJson);

	return data(
		{ status: result.status, recipes: result.recipes, error: result.error },
		{ headers: NO_STORE },
	);
}
