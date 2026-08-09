import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildFlagContext } from "~/lib/feature-flags/context.server";
import { getActiveNutritionConsent } from "~/lib/nutrition/consent.server";
import {
	clearManifestPersonalIntake,
	upsertManifestPersonalIntake,
} from "~/lib/nutrition/intake-log.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { ManifestPersonalIntakeUpsertSchema } from "~/lib/schemas/manifest";
import type { Route } from "./+types/meal-plans.$id.entries.$entryId.intake";

/**
 * POST /api/meal-plans/:id/entries/:entryId/intake — Private Eat upsert.
 * DELETE — Remove my log (soft-void active personal intake).
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const planId = params.id;
	const entryId = params.entryId;
	if (!planId || !entryId) {
		throw data({ error: "Plan and entry ID required" }, { status: 400 });
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

	const flagContext = buildFlagContext(request, context.cloudflare.env, {
		user,
	});

	try {
		if (request.method === "POST") {
			const json = await request.json();
			const parsed = ManifestPersonalIntakeUpsertSchema.safeParse(json);
			if (!parsed.success) {
				throw data(
					{ error: "Invalid request", details: parsed.error.flatten() },
					{ status: 400 },
				);
			}

			const result = await upsertManifestPersonalIntake(
				context.cloudflare.env,
				{
					organizationId: groupId,
					userId: user.id,
					planId,
					entryId,
					servings: parsed.data.servings,
					idempotencyKey: parsed.data.idempotencyKey,
					consent: parsed.data.consent,
					consentSource: "web",
					flagContext,
				},
			);

			const consent = await getActiveNutritionConsent(
				context.cloudflare.env.DB,
				user.id,
				"intake",
			);

			return {
				intake: {
					id: result.intake.id,
					servings: result.intake.servings,
					energyKcal: result.intake.energyKcal,
					proteinG: result.intake.proteinG,
					carbsG: result.intake.carbsG,
					fatG: result.intake.fatG,
					occurredAt: result.intake.occurredAt.toISOString(),
				},
				idempotent: result.idempotent,
				replaced: result.replaced,
				intakeConsentGranted: consent != null,
			};
		}

		if (request.method === "DELETE") {
			const result = await clearManifestPersonalIntake(context.cloudflare.env, {
				organizationId: groupId,
				userId: user.id,
				planId,
				entryId,
				flagContext,
			});
			return {
				cleared: result.cleared,
				voidedIntakeId: result.voidedIntakeId,
			};
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
