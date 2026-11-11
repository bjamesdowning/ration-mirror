import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { meal } from "~/db/schema";
import { createMeal } from "~/lib/meals.server";
import { getQueueJob, importJobReadableBy } from "~/lib/queue-job.server";
import { parseJobResultJson } from "~/lib/queue-status-loader.server";
import type { MealInput } from "~/lib/schemas/meal";
import { MealSchema } from "~/lib/schemas/meal";

export interface ConfirmRecipeImportInput {
	organizationId: string;
	requestId: string;
	userId?: string | null;
}

export async function confirmRecipeImport(
	env: Cloudflare.Env,
	input: ConfirmRecipeImportInput,
) {
	const { organizationId, requestId, userId } = input;

	const job = await getQueueJob(env.DB, requestId);
	if (
		!job ||
		!userId ||
		!importJobReadableBy(job, { userId, organizationId })
	) {
		throw data(
			{ error: "Import session expired. Please try again." },
			{ status: 404 },
		);
	}

	if (job.status !== "completed") {
		throw data(
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
		throw data(
			{ error: "Import job has no extract to confirm" },
			{ status: 400 },
		);
	}

	const parsedRecipe = MealSchema.safeParse(result.extractedRecipe);
	if (!parsedRecipe.success) {
		throw data({ error: "Extracted recipe is invalid" }, { status: 400 });
	}
	const extractedRecipe = parsedRecipe.data as MealInput;

	const db = drizzle(env.DB);
	const confirmed = await db
		.select({
			id: meal.id,
			name: meal.name,
			organizationId: meal.organizationId,
		})
		.from(meal)
		.where(eq(meal.importRequestId, requestId))
		.limit(1);
	if (confirmed[0]) {
		if (confirmed[0].organizationId !== organizationId) {
			throw data(
				{ error: "Import session expired. Please try again." },
				{ status: 404 },
			);
		}
		return { meal: { id: confirmed[0].id, name: confirmed[0].name } };
	}

	const duplicates = await db
		.select({ id: meal.id, name: meal.name })
		.from(meal)
		.where(
			and(
				eq(meal.organizationId, organizationId),
				sql`json_extract(${meal.customFields}, '$.sourceUrl') = ${result.sourceUrl}`,
			),
		)
		.limit(1);

	if (duplicates.length > 0 && duplicates[0]) {
		const dup = duplicates[0];
		return {
			meal: { id: dup.id, name: dup.name },
			code: "DUPLICATE_URL" as const,
		};
	}

	try {
		const created = await createMeal(env.DB, organizationId, extractedRecipe, {
			env,
			userId,
			importRequestId: requestId,
		});
		if (!created) {
			throw data({ error: "Failed to create meal" }, { status: 500 });
		}
		return { meal: { id: created.id, name: created.name } };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/capacity_exceeded/.test(message)) {
			throw data(
				{ error: "Meal capacity reached", code: "capacity_exceeded" },
				{ status: 403 },
			);
		}
		if (/unique/i.test(message)) {
			const again = await db
				.select({ id: meal.id, name: meal.name })
				.from(meal)
				.where(
					and(
						eq(meal.importRequestId, requestId),
						eq(meal.organizationId, organizationId),
					),
				)
				.limit(1);
			if (again[0]) return { meal: { id: again[0].id, name: again[0].name } };
		}
		throw error;
	}
}
