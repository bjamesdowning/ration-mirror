/**
 * GET /api/meals/import/status/:requestId
 * Poll endpoint for import-URL job status. D1-backed for strong consistency.
 */
import { data } from "react-router";
import {
	NO_STORE,
	parseJobResultJson,
	requireQueueJobForStatus,
} from "~/lib/queue-status-loader.server";
import type { Route } from "./+types/meals.import.status.$requestId";

export async function loader({ params, request, context }: Route.LoaderArgs) {
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
			code: result.code,
			error: result.error,
			existingMealId: result.existingMealId,
			existingMealName: result.existingMealName,
		},
		{ headers: NO_STORE },
	);
}
