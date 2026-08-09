import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildFlagContext } from "~/lib/feature-flags/flags.server";
import { NUTRITION_RESOLVE_CONCURRENCY } from "~/lib/nutrition/constants";
import { mapWithConcurrency } from "~/lib/nutrition/map-concurrency";
import { maybeResolveCargoNutrition } from "~/lib/nutrition/persist.server";
import type { NutritionSnapshot } from "~/lib/nutrition/types";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { NutritionResolveRequestSchema } from "~/lib/schemas/nutrition";
import type { Route } from "./+types/nutrition.resolve";

/**
 * Resolve proposed nutrition snapshots for item names (scan review).
 * Flag-gated: nutrition-engine must be on.
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
	const flagContext = buildFlagContext(request, env, { user });

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

		// Ignore client allowAiEstimate — only scan_review ingest path may AI-fill.
		const allowAiEstimate = parsed.data.ingestSource === "scan_review";

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

		const snapshots: Record<string, NutritionSnapshot | null> = {};
		for (const [name, snap] of entries) {
			snapshots[name] = snap;
		}

		return { snapshots };
	} catch (error) {
		return handleApiError(error);
	}
}
