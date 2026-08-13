import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { ensureMealPlan } from "~/lib/manifest.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import {
	clearManifestIntakes,
	logManifestIntakes,
	resolveHttpOperationKey,
} from "~/lib/nutrition/service.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { ManifestPersonalIntakeUpsertSchema } from "~/lib/schemas/manifest";
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
		const flagContext = buildMobileFlagContext(
			request,
			context.cloudflare.env,
			{
				user: { id: userId },
			},
		);
		const principal = {
			userId,
			organizationId,
			surface: "mobile" as const,
			authMethod: "mobile_bearer",
			scopes: ["nutrition:read", "nutrition:write"],
			requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
		};

		if (request.method === "POST") {
			const body = await request.json();
			const parsed = ManifestPersonalIntakeUpsertSchema.parse(body);
			const result = await logManifestIntakes(
				context.cloudflare.env,
				principal,
				flagContext,
				{
					operationKey: resolveHttpOperationKey(
						request.headers,
						parsed.idempotencyKey,
					),
					planId: plan.id,
					items: [
						{
							entryId,
							servings: parsed.servings,
							amount: parsed.amount ?? undefined,
							unit: parsed.unit ?? undefined,
							idempotencyKey: parsed.idempotencyKey,
							notes: parsed.notes,
						},
					],
				},
			);
			const item = result.items[0];
			if (!item) throw new Error("Nutrition operation returned no item");

			const undoToken =
				result.undoExpiresAt && Date.now() <= result.undoExpiresAt.getTime()
					? result.operationId
					: undefined;

			return {
				intake: {
					id: item.intake.id,
					servings: item.intake.servings,
					energyKcal: item.intake.energyKcal,
					proteinG: item.intake.proteinG,
					carbsG: item.intake.carbsG,
					fatG: item.intake.fatG,
					occurredAt: item.intake.occurredAt.toISOString(),
					notes: item.intake.notes ?? null,
					loggedAmount: item.intake.loggedAmount ?? null,
					loggedUnit: item.intake.loggedUnit ?? null,
				},
				idempotent: item.replayed,
				replayed: result.replayed,
				replaced: item.replacedIntakeId != null,
				intakeConsentGranted: true,
				operationId: result.operationId,
				dayTotals: result.dayTotals,
				summaryGeneratedAt: result.summaryGeneratedAt,
				undoToken,
			};
		}

		if (request.method === "DELETE") {
			const url = new URL(request.url);
			const operationKey = resolveHttpOperationKey(
				request.headers,
				url.searchParams.get("operationKey"),
			);
			const result = await clearManifestIntakes(
				context.cloudflare.env,
				principal,
				flagContext,
				{
					operationKey,
					planId: plan.id,
					entryIds: [entryId],
				},
			);
			const item = result.items[0];
			if (!item) throw new Error("Nutrition operation returned no item");
			const undoToken =
				item.voidedIntakeId &&
				result.undoExpiresAt &&
				Date.now() <= result.undoExpiresAt.getTime()
					? result.operationId
					: undefined;

			return {
				cleared: item.voidedIntakeId != null,
				voidedIntakeId: item.voidedIntakeId,
				replayed: result.replayed,
				operationId: result.operationId,
				dayTotals: result.dayTotals,
				summaryGeneratedAt: result.summaryGeneratedAt,
				undoToken,
			};
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
