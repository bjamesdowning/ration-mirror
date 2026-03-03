/**
 * POST /api/meals/import/confirm
 * Persists an extracted recipe from a completed import job to the Galley.
 * Call after the user confirms the verification screen.
 */
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { meal } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { createMeal } from "~/lib/meals.server";
import { getQueueJob } from "~/lib/queue-job.server";
import { parseJobResultJson } from "~/lib/queue-status-loader.server";
import type { MealInput } from "~/lib/schemas/meal";
import { MealSchema } from "~/lib/schemas/meal";
import { ImportConfirmRequestSchema } from "~/lib/schemas/recipe-import";
import type { Route } from "./+types/meals.import.confirm";

export async function action({ request, context }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	if (request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return data({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = ImportConfirmRequestSchema.safeParse(body);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		return data(
			{ error: firstIssue?.message ?? "Invalid request" },
			{ status: 400 },
		);
	}

	const { requestId } = parsed.data;

	const env = (context.cloudflare as { env: Env }).env;
	const job = await getQueueJob(env.DB, requestId);
	if (!job) {
		return data(
			{ error: "Import session expired. Please try again." },
			{ status: 404 },
		);
	}
	if (job.organizationId !== groupId) {
		return data(
			{ error: "Import session expired. Please try again." },
			{ status: 404 },
		);
	}

	if (job.status !== "completed") {
		return data(
			{ error: "Import job is not ready for confirmation" },
			{ status: 400 },
		);
	}

	const result = parseJobResultJson<{
		status: "completed" | "failed";
		success?: boolean;
		extractedRecipe?: unknown;
		sourceUrl?: string;
	}>(job.resultJson);

	if (!result.success || !result.extractedRecipe || !result.sourceUrl) {
		return data(
			{ error: "Import job has no extract to confirm" },
			{ status: 400 },
		);
	}

	const parsedRecipe = MealSchema.safeParse(result.extractedRecipe);
	if (!parsedRecipe.success) {
		return data({ error: "Extracted recipe is invalid" }, { status: 400 });
	}
	const extractedRecipe = parsedRecipe.data as MealInput;

	// Re-check duplicate (race: same URL imported elsewhere before confirm)
	const db = drizzle(env.DB);
	const duplicates = await db
		.select({ id: meal.id, name: meal.name })
		.from(meal)
		.where(
			and(
				eq(meal.organizationId, groupId),
				sql`json_extract(${meal.customFields}, '$.sourceUrl') = ${result.sourceUrl}`,
			),
		)
		.limit(1);

	if (duplicates.length > 0 && duplicates[0]) {
		const dup = duplicates[0];
		return data(
			{
				meal: { id: dup.id, name: dup.name },
				code: "DUPLICATE_URL",
			},
			{ status: 200 },
		);
	}

	try {
		const created = await createMeal(env.DB, groupId, extractedRecipe, env);
		if (!created) {
			return data({ error: "Failed to create meal" }, { status: 500 });
		}
		return data({ meal: { id: created.id, name: created.name } });
	} catch (err) {
		return handleApiError(err);
	}
}
