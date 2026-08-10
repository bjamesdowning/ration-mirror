import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildWebFlagContext } from "~/lib/feature-flags/flags.server";
import { NUTRITION_RESOLVE_CONCURRENCY } from "~/lib/nutrition/constants";
import { serializeNutritionSnapshot } from "~/lib/nutrition/dto.server";
import { mapWithConcurrency } from "~/lib/nutrition/map-concurrency";
import { maybeResolveCargoNutrition } from "~/lib/nutrition/persist.server";
import { allowAiEstimateForResolveIngestSource } from "~/lib/nutrition/resolve-ai-policy";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { NutritionResolveRequestSchema } from "~/lib/schemas/nutrition";
import type { Route } from "./+types/nutrition.resolve";

/**
 * Resolve proposed nutrition snapshots for item names (scan / dock review).
 * Flag-gated: nutrition-engine must be on.
 * AI after USDA miss when ingestSource is scan_review (and nutrition-ai-estimate).
 */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const env = context.cloudflare.env;
	const flagContext = buildWebFlagContext(request, env, { user });

	await assertFeatureEnabled(env, "nutrition-engine", flagContext);

	const rateLimitResult = await checkRateLimit(
		env.RATION_KV,
		"nutrition_resolve",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many nutrition resolve requests. Please try again later.",
		);
	}

	try {
		const body = await request.json();
		const parsed = NutritionResolveRequestSchema.safeParse(body);
		if (!parsed.success) {
			throw data(
				{ error: "Invalid request", issues: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		const uniqueNames = [
			...new Set(parsed.data.names.map((n) => n.trim())),
		].filter(Boolean);

		// Deprecated body allowAiEstimate is ignored; only ingestSource gates AI.
		void parsed.data.allowAiEstimate;
		const allowAiEstimate = allowAiEstimateForResolveIngestSource(
			parsed.data.ingestSource,
		);

		const entries = await mapWithConcurrency(
			uniqueNames,
			NUTRITION_RESOLVE_CONCURRENCY,
			async (name) => {
				const snapshot = await maybeResolveCargoNutrition(
					env,
					name,
					flagContext,
					{
						allowAiEstimate,
						organizationId: groupId,
						userId: user.id,
					},
				);
				return [name, snapshot] as const;
			},
		);

		const snapshots: Record<
			string,
			ReturnType<typeof serializeNutritionSnapshot> | null
		> = {};
		for (const [name, snap] of entries) {
			snapshots[name] = snap ? serializeNutritionSnapshot(snap) : null;
		}

		return { snapshots };
	} catch (error) {
		return handleApiError(error);
	}
}
