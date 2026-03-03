/**
 * GET /api/meals/generate/status/:requestId
 * Poll endpoint for meal generation job status. D1-backed for strong consistency.
 */
import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { getQueueJob } from "~/lib/queue-job.server";
import { RequestIdSchema } from "~/lib/schemas/queue";
import type { Route } from "./+types/meals.generate.status.$requestId";

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
	};

	return data(
		{ status: result.status, recipes: result.recipes, error: result.error },
		{ headers: noStore },
	);
}
