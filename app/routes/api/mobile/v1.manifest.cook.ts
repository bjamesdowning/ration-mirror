import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { ensureMealPlan } from "~/lib/manifest.server";
import { cookManifestEntries } from "~/lib/manifest-cook.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { CookEntriesRequestSchema } from "~/lib/schemas/manifest";
import { tryStoreUndoToken } from "~/lib/undo-token.server";
import type { Route } from "./+types/v1.manifest.cook";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const flagContext = buildMobileFlagContext(
			request,
			context.cloudflare.env,
			{
				user: { id: userId },
			},
		);
		await assertFeatureEnabled(
			context.cloudflare.env,
			"nutrition-cook-log-split",
			flagContext,
		);

		const body = await request.json();
		const { entryIds, confirmInsufficient } =
			CookEntriesRequestSchema.parse(body);
		const plan = await ensureMealPlan(
			context.cloudflare.env.DB,
			organizationId,
		);
		const result = await cookManifestEntries(
			context.cloudflare.env,
			organizationId,
			plan.id,
			entryIds,
			{
				confirmInsufficient,
				userId,
				source: "mobile",
			},
		);

		if (result.requiresConfirmation) {
			return {
				cooked: 0,
				requiresConfirmation: true,
				missingIngredients: result.missingIngredients,
				alreadyCookedIds: result.alreadyCookedIds,
			};
		}

		let undoToken: string | undefined;
		if (result.cooked > 0) {
			undoToken = await tryStoreUndoToken(context.cloudflare.env.RATION_KV, {
				userId,
				organizationId,
				kind: "manifest_cook",
				deductions: result.deductions,
				manifestEntryIds: result.entryIds,
				planId: result.planId,
				eventIds: result.eventIds,
			});
		}

		return {
			cooked: result.cooked,
			entryIds: result.entryIds,
			alreadyCookedIds: result.alreadyCookedIds,
			partialCook: result.partialCook,
			skippedIngredients: result.skippedIngredients,
			undoToken,
			deductions: result.deductions,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
