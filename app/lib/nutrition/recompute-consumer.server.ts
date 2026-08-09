import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import {
	type NutritionRecomputeJobMessage,
	NutritionRecomputeJobSchema,
} from "~/lib/schemas/nutrition";
import { emitNutritionRecomputeProcessed } from "~/lib/telemetry.server";
import { recomputeAndStoreMealNutrition } from "./persist.server";

/**
 * Consumer stub for async nutrition recompute jobs (Slice 8).
 * Processes a single meal recompute when flag is on; batch/cargo paths are no-ops.
 */
export async function consumeNutritionRecomputeJob(
	env: Env,
	db: D1Database,
	rawMessage: unknown,
	flagContext: FlagshipEvaluationContext,
): Promise<{ processed: boolean; reason?: string }> {
	const enabled = await isFeatureEnabled(
		env,
		"nutrition-async-recompute",
		flagContext,
	);
	if (!enabled) {
		return { processed: false, reason: "flag_off" };
	}

	const message = NutritionRecomputeJobSchema.safeParse(rawMessage);
	if (!message.success) {
		return { processed: false, reason: "invalid_message" };
	}

	const job = message.data;
	if (job.mealId) {
		await recomputeAndStoreMealNutrition(
			env,
			db,
			job.mealId,
			job.organizationId,
			flagContext,
		);
		emitNutritionRecomputeProcessed(job.trigger, "ok");
		return { processed: true };
	}

	emitNutritionRecomputeProcessed(job.trigger, "skipped");
	return { processed: false, reason: "no_meal_id" };
}

export type { NutritionRecomputeJobMessage };
