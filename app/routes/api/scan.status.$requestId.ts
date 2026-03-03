/**
 * GET /api/scan/status/:requestId
 * Poll endpoint for scan job status. D1-backed for strong consistency.
 */
import { data } from "react-router";
import {
	NO_STORE,
	parseJobResultJson,
	requireQueueJobForStatus,
} from "~/lib/queue-status-loader.server";
import type { Route } from "./+types/scan.status.$requestId";

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
		items?: Array<{
			id: string;
			name: string;
			quantity: number;
			unit: string;
			domain: string;
			tags: string[];
			expiresAt?: string;
			selected: boolean;
			confidence?: number;
		}>;
		existingInventory?: Array<{
			id: string;
			name: string;
			quantity: number;
			unit: string;
		}>;
		metadata?: { source: string; filename?: string; processedAt: string };
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
}
