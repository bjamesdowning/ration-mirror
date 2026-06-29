import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { getQueueJob } from "~/lib/queue-job.server";
import { NO_STORE, parseJobResultJson } from "~/lib/queue-status-loader.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { RequestIdSchema } from "~/lib/schemas/queue";
import type { Route } from "./+types/v1.scan.$requestId";

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
			throw data(
				{ error: "Too many status poll requests. Please try again later." },
				{
					status: 429,
					headers: { ...NO_STORE, "Retry-After": "60" },
				},
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

		if (job.status === "pending") {
			return data({ status: "pending" }, { headers: NO_STORE });
		}

		const result = parseJobResultJson<{
			status: "pending" | "completed" | "failed";
			items?: Array<Record<string, unknown>>;
			existingInventory?: Array<Record<string, unknown>>;
			metadata?: Record<string, unknown>;
			error?: string;
		}>(job.resultJson);

		return data(
			{
				status: result.status,
				items: result.items,
				existingInventory: result.existingInventory,
				metadata: result.metadata,
				error: result.error,
			},
			{ headers: NO_STORE },
		);
	} catch (e) {
		return handleApiError(e);
	}
}
