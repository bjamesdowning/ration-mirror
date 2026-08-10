import type { z } from "zod";
import type { NutritionIngestSourceSchema } from "~/lib/schemas/nutrition";

type NutritionIngestSource = z.infer<typeof NutritionIngestSourceSchema>;

/**
 * Whether nutrition resolve may request AI fill after USDA miss.
 * Mirrors cargo.batch: only `scan_review` (receipt / image / dock review).
 * `nutrition-ai-estimate` is still enforced inside maybeResolveCargoNutrition.
 */
export function allowAiEstimateForResolveIngestSource(
	ingestSource: NutritionIngestSource | undefined,
): boolean {
	return ingestSource === "scan_review";
}
