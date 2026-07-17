import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { consumeManifestEntries, ensureMealPlan } from "~/lib/manifest.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { ConsumeEntriesRequestSchema } from "~/lib/schemas/manifest";
import { tryStoreUndoToken } from "~/lib/undo-token.server";
import type { Route } from "./+types/v1.manifest.consume";

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

		const body = await request.json();
		const { entryIds, confirmInsufficient } =
			ConsumeEntriesRequestSchema.parse(body);
		const plan = await ensureMealPlan(
			context.cloudflare.env.DB,
			organizationId,
		);
		const result = await consumeManifestEntries(
			context.cloudflare.env,
			organizationId,
			plan.id,
			entryIds,
			{ confirmInsufficient },
		);

		if (result.requiresConfirmation) {
			return {
				consumed: 0,
				requiresConfirmation: true,
				missingIngredients: result.missingIngredients,
			};
		}

		let undoToken: string | undefined;
		if (result.consumed > 0) {
			undoToken = await tryStoreUndoToken(context.cloudflare.env.RATION_KV, {
				userId,
				organizationId,
				kind: "manifest_consume",
				deductions: result.deductions,
				manifestEntryIds: result.entryIds,
				planId: result.planId,
			});
		}

		return {
			consumed: result.consumed,
			undoToken,
			deductions: result.deductions,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
