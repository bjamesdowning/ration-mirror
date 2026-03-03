/**
 * GET /api/meals/generate/status/:requestId
 * Poll endpoint for meal generation job status. Returns KV-stored result from consumer.
 */
import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { RequestIdSchema } from "~/lib/schemas/queue";
import type { Route } from "./+types/meals.generate.status.$requestId";

export async function loader({ params, request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const requestIdResult = RequestIdSchema.safeParse(params.requestId);
	if (!requestIdResult.success) {
		throw data({ error: "Invalid request ID" }, { status: 400 });
	}
	const requestId = requestIdResult.data;

	const env = context.cloudflare.env;
	const kvKey = `meal-generate:${requestId}`;
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
		mealIds?: string[];
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
		mealIds: result.mealIds,
		recipes: result.recipes,
		error: result.error,
	});
}
