/**
 * GET /api/scan/status/:requestId
 * Poll endpoint for scan job status. D1-backed for strong consistency.
 */
import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { getQueueJob } from "~/lib/queue-job.server";
import { RequestIdSchema } from "~/lib/schemas/queue";
import type { Route } from "./+types/scan.status.$requestId";

export async function loader({ params, request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const requestIdResult = RequestIdSchema.safeParse(params.requestId);
	const noStore = { "Cache-Control": "no-store" };
	if (!requestIdResult.success) {
		throw data(
			{ error: "Invalid request ID" },
			{ status: 400, headers: noStore },
		);
	}
	const requestId = requestIdResult.data;

	const job = await getQueueJob(context.cloudflare.env.DB, requestId);
	if (!job) {
		throw data(
			{ error: "Job not found or expired", status: "unknown" },
			{ status: 404, headers: noStore },
		);
	}

	if (job.organizationId !== groupId) {
		throw data(
			{ error: "Job not found or expired", status: "unknown" },
			{ status: 404, headers: noStore },
		);
	}

	if (job.status === "pending") {
		return data(
			{ status: "pending", organizationId: job.organizationId },
			{ headers: noStore },
		);
	}

	const result = (job.resultJson ? JSON.parse(job.resultJson) : {}) as {
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
	};

	return data(
		{
			status: result.status,
			items: result.items,
			existingInventory: result.existingInventory,
			metadata: result.metadata,
			error: result.error,
		},
		{ headers: noStore },
	);
}
