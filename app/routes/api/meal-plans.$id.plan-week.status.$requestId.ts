/**
 * GET /api/meal-plans/:id/plan-week/status/:requestId
 * Poll endpoint for plan-week job status. D1-backed for strong consistency.
 */
import { data } from "react-router";
import {
	NO_STORE,
	parseJobResultJson,
	requireQueueJobForStatus,
} from "~/lib/queue-status-loader.server";
import type { Route } from "./+types/meal-plans.$id.plan-week.status.$requestId";

export async function loader({ params, request, context }: Route.LoaderArgs) {
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
		schedule?: Array<{
			date: string;
			slotType: string;
			mealId: string;
			mealName: string;
			notes?: string | null;
		}>;
		error?: string;
	}>(job.resultJson);

	return data(
		{ status: result.status, schedule: result.schedule, error: result.error },
		{ headers: NO_STORE },
	);
}
