import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { getQueueJob, toClientQueueJobStatus } from "~/lib/queue-job.server";
import { NO_STORE, parseJobResultJson } from "~/lib/queue-status-loader.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { RequestIdSchema } from "~/lib/schemas/queue";
import type { Route } from "./+types/v1.meals.import.$requestId";

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
			const pending = parseJobResultJson<{
				progress?: "reading_page" | "listening_to_video" | "extracting";
			}>(job.resultJson);
			return data(
				{ status: "pending", progress: pending.progress },
				{ headers: NO_STORE },
			);
		}

		const result = parseJobResultJson<{
			status: "completed" | "failed";
			success?: boolean;
			meal?: { id: string; name: string };
			extractedRecipe?: unknown;
			sourceUrl?: string;
			completeness?: "full" | "skeleton" | "link_holder";
			code?: string;
			error?: string;
			existingMealId?: string;
			existingMealName?: string;
			softFailToPhoto?: boolean;
			progress?: "reading_page" | "listening_to_video" | "extracting";
			evidence?: string[];
			ingredientCount?: number;
			stepCount?: number;
			missingAmountCount?: number;
		}>(job.resultJson);

		return data(
			{
				status: result.status,
				success: result.success,
				meal: result.meal,
				extractedRecipe: result.extractedRecipe,
				sourceUrl: result.sourceUrl,
				completeness: result.completeness,
				code: result.code,
				error: result.error,
				existingMealId: result.existingMealId,
				existingMealName: result.existingMealName,
				softFailToPhoto: result.softFailToPhoto === true,
				progress: result.progress,
				evidence: result.evidence,
				ingredientCount: result.ingredientCount,
				stepCount: result.stepCount,
				missingAmountCount: result.missingAmountCount,
			},
			{ headers: NO_STORE },
		);
	} catch (e) {
		return handleApiError(e);
	}
}
