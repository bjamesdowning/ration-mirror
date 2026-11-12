import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import {
	deleteEntry,
	ensureMealPlan,
	updateEntry,
} from "~/lib/manifest.server";
import { serializeManifestEntryForWire } from "~/lib/manifest-wire.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { isPlanFuelActionsEnabled } from "~/lib/nutrition/fast-log-flag.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MealPlanEntryUpdateSchema } from "~/lib/schemas/manifest";
import type { Route } from "./+types/v1.manifest.entries.$entryId";

/** DELETE or PATCH /api/mobile/v1/manifest/entries/:entryId */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "DELETE" && request.method !== "PATCH") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const entryId = params.entryId;
	if (!entryId) {
		throw data({ error: "Entry ID required" }, { status: 400 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"grocery_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const plan = await ensureMealPlan(
			context.cloudflare.env.DB,
			organizationId,
		);

		if (request.method === "PATCH") {
			const flags = buildMobileFlagContext(request, context.cloudflare.env, {
				user: { id: userId },
			});
			if (!(await isPlanFuelActionsEnabled(context.cloudflare.env, flags))) {
				throw data(
					{
						error: "Plan and Fuel actions are unavailable.",
						code: "FEATURE_DISABLED",
					},
					{ status: 403 },
				);
			}
			const input = MealPlanEntryUpdateSchema.parse(await request.json());
			const updated = await updateEntry(
				context.cloudflare.env.DB,
				organizationId,
				plan.id,
				entryId,
				input,
			);
			if (!updated) throw data({ error: "Entry not found" }, { status: 404 });
			return { entry: serializeManifestEntryForWire(updated) };
		}

		const deleted = await deleteEntry(
			context.cloudflare.env.DB,
			organizationId,
			plan.id,
			entryId,
		);
		if (!deleted) {
			throw data({ error: "Entry not found" }, { status: 404 });
		}

		return { deleted: true };
	} catch (e) {
		return handleApiError(e);
	}
}
