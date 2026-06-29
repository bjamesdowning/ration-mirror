import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import {
	NO_STORE,
	parseJobResultJson,
	requireQueueJobForStatus,
} from "~/lib/queue-status-loader.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.scan.$requestId";

export async function loader({ params, request, context }: Route.LoaderArgs) {
	try {
		const { userId } = await requireMobileActiveGroup(context, request);

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

		const { job } = await requireQueueJobForStatus({
			params,
			request,
			context,
		});

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
