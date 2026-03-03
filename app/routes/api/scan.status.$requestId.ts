/**
 * GET /api/scan/status/:requestId
 * Poll endpoint for scan job status. Returns KV-stored result from consumer.
 */
import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { RequestIdSchema } from "~/lib/schemas/queue";
import type { Route } from "./+types/scan.status.$requestId";

export async function loader({ params, request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const requestIdResult = RequestIdSchema.safeParse(params.requestId);
	if (!requestIdResult.success) {
		throw data({ error: "Invalid request ID" }, { status: 400 });
	}
	const requestId = requestIdResult.data;

	const env = context.cloudflare.env;
	const kvKey = `scan-job:${requestId}`;
	const raw = await env.RATION_KV.get(kvKey);

	if (!raw) {
		throw data(
			{ error: "Job not found or expired", status: "unknown" },
			{ status: 404 },
		);
	}

	const result = JSON.parse(raw) as {
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

	if (result.status === "pending") {
		if (result.organizationId && result.organizationId !== groupId) {
			throw data(
				{ error: "Job not found or expired", status: "unknown" },
				{ status: 404 },
			);
		}
		return data({
			status: "pending",
			organizationId: result.organizationId,
		});
	}

	if (result.organizationId && result.organizationId !== groupId) {
		throw data(
			{ error: "Job not found or expired", status: "unknown" },
			{ status: 404 },
		);
	}

	return data({
		status: result.status,
		items: result.items,
		existingInventory: result.existingInventory,
		metadata: result.metadata,
		error: result.error,
	});
}
