import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildFlagContext } from "~/lib/feature-flags/context.server";
import { ensureMealPlan } from "~/lib/manifest.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { getActiveNutritionConsent } from "~/lib/nutrition/consent.server";
import {
	clearManifestPersonalIntake,
	upsertManifestPersonalIntake,
} from "~/lib/nutrition/intake-log.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { ManifestPersonalIntakeUpsertSchema } from "~/lib/schemas/manifest";
import { tryStoreUndoToken } from "~/lib/undo-token.server";
import type { Route } from "./+types/v1.manifest.entries.$entryId.intake";

/**
 * POST /api/mobile/v1/manifest/entries/:entryId/intake — Private Eat upsert.
 * DELETE — Remove my log.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
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
			"meal_mutation",
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
		const flagContext = buildFlagContext(request, context.cloudflare.env, {
			user: { id: userId },
		});

		if (request.method === "POST") {
			const body = await request.json();
			const parsed = ManifestPersonalIntakeUpsertSchema.parse(body);
			const result = await upsertManifestPersonalIntake(
				context.cloudflare.env,
				{
					organizationId,
					userId,
					planId: plan.id,
					entryId,
					servings: parsed.servings,
					idempotencyKey: parsed.idempotencyKey,
					consent: parsed.consent,
					consentSource: "mobile",
					flagContext,
				},
			);

			let undoToken: string | undefined;
			if (!result.idempotent) {
				undoToken = await tryStoreUndoToken(context.cloudflare.env.RATION_KV, {
					userId,
					organizationId,
					kind: "manifest_intake",
					deductions: [],
					intakeIds: [result.intake.id],
					restoreIntakeId: result.replacedIntakeId,
				});
			}

			const consent = await getActiveNutritionConsent(
				context.cloudflare.env.DB,
				userId,
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
				undoToken,
			};
		}

		if (request.method === "DELETE") {
			const result = await clearManifestPersonalIntake(context.cloudflare.env, {
				organizationId,
				userId,
				planId: plan.id,
				entryId,
				flagContext,
			});

			let undoToken: string | undefined;
			if (result.cleared && result.voidedIntakeId) {
				undoToken = await tryStoreUndoToken(context.cloudflare.env.RATION_KV, {
					userId,
					organizationId,
					kind: "manifest_intake",
					deductions: [],
					intakeIds: [],
					restoreIntakeId: result.voidedIntakeId,
				});
			}

			return {
				cleared: result.cleared,
				voidedIntakeId: result.voidedIntakeId,
				undoToken,
			};
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
