import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { normalizeMobileGeneratedRecipes } from "~/lib/mobile/generated-recipes.server";
import { getQueueJob, toClientQueueJobStatus } from "~/lib/queue-job.server";
import { NO_STORE, parseJobResultJson } from "~/lib/queue-status-loader.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { RequestIdSchema } from "~/lib/schemas/queue";
import type { Route } from "./+types/v1.meals.generate.$requestId";

export async function loader({ params, request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"status_poll",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many status poll requests. Please try again later.",
			);
		}

		const requestIdResult = RequestIdSchema.safeParse(params.requestId);
		if (!requestIdResult.success) {
			throw data(
				{ error: "Invalid request ID" },
				{ status: 400, headers: NO_STORE },
			);
		}

		const job = await getQueueJob(
			context.cloudflare.env.DB,
			requestIdResult.data,
		);
		if (!job || job.organizationId !== organizationId) {
			throw data(
				{ error: "Job not found or expired", status: "unknown" },
				{ status: 404, headers: NO_STORE },
			);
		}

		if (toClientQueueJobStatus(job.status) === "pending") {
			return data({ status: "pending" }, { headers: NO_STORE });
		}

		const result = parseJobResultJson<{
			status: "pending" | "completed" | "failed";
			recipes?: Array<Record<string, unknown>>;
			error?: string;
		}>(job.resultJson);

		const recipes =
			result.status === "completed" && result.recipes
				? normalizeMobileGeneratedRecipes(result.recipes)
				: result.recipes;

		return data(
			{
				status: result.status,
				recipes,
				error: result.error,
			},
			{ headers: NO_STORE },
		);
	} catch (e) {
		return handleApiError(e);
	}
}
