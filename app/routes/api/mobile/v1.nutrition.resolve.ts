import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildMobileFlagContext } from "~/lib/feature-flags/flags.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { NUTRITION_RESOLVE_CONCURRENCY } from "~/lib/nutrition/constants";
import { serializeNutritionSnapshot } from "~/lib/nutrition/dto.server";
import { mapWithConcurrency } from "~/lib/nutrition/map-concurrency";
import { maybeResolveCargoNutrition } from "~/lib/nutrition/persist.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { NutritionResolveRequestSchema } from "~/lib/schemas/nutrition";
import type { Route } from "./+types/v1.nutrition.resolve";

/**
 * POST /api/mobile/v1/nutrition/resolve
 * Propose nutrition snapshots for item names (scan review). Gated by nutrition-engine.
 */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;
		const flagContext = buildMobileFlagContext(request, env, {
			user: { id: userId },
		});

		await assertFeatureEnabled(env, "nutrition-engine", flagContext);

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"nutrition_resolve",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many nutrition resolve requests. Please try again later.",
			);
		}

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

		// Body ingestSource/allowAiEstimate are accepted for compatibility but
		// ignored as policy inputs. AI remains disabled until a server-verified
		// scan/job binding exists (and nutrition-ai-estimate is on).
		void parsed.data.ingestSource;
		void parsed.data.allowAiEstimate;
		const allowAiEstimate = false;

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
						organizationId,
						userId,
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
