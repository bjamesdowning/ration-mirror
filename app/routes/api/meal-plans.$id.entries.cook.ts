import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import { cookManifestEntries } from "~/lib/manifest-cook.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { CookEntriesRequestSchema } from "~/lib/schemas/manifest";
import type { Route } from "./+types/meal-plans.$id.entries.cook";

/**
 * POST /api/meal-plans/:id/entries/cook — Shared Cook: deduct Cargo once and
 * mark entries Prepared. Never writes personal nutrition.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const planId = params.id;
	if (!planId) throw data({ error: "Plan ID required" }, { status: 400 });

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"meal_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many requests. Please try again later.",
		);
	}

	try {
		const flagContext = buildWebFlagContext(request, context.cloudflare.env, {
			user,
		});
		await assertFeatureEnabled(
			context.cloudflare.env,
			"nutrition-cook-log-split",
			flagContext,
		);

		const json = await request.json();
		const parsed = CookEntriesRequestSchema.safeParse(json);
		if (!parsed.success) {
			throw data(
				{ error: "Invalid request", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		const result = await cookManifestEntries(
			context.cloudflare.env,
			groupId,
			planId,
			parsed.data.entryIds,
			{
				confirmInsufficient: parsed.data.confirmInsufficient,
				userId: user.id,
				source: "web",
			},
		);

		return {
			cooked: result.cooked,
			entryIds: result.entryIds,
			alreadyCookedIds: result.alreadyCookedIds,
			requiresConfirmation: result.requiresConfirmation,
			missingIngredients: result.missingIngredients,
			partialCook: result.partialCook,
			skippedIngredients: result.skippedIngredients,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
