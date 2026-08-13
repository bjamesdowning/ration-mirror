import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import {
	clearManifestIntakes,
	logManifestIntakes,
	resolveHttpOperationKey,
} from "~/lib/nutrition/service.server";
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

	const flagContext = buildWebFlagContext(request, context.cloudflare.env, {
		user,
	});
	const principal = {
		userId: user.id,
		organizationId: groupId,
		surface: "web" as const,
		authMethod: "session",
		scopes: ["nutrition:read", "nutrition:write"],
		requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
	};

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

			const result = await logManifestIntakes(
				context.cloudflare.env,
				principal,
				flagContext,
				{
					operationKey: resolveHttpOperationKey(
						request.headers,
						parsed.data.idempotencyKey,
					),
					planId,
					items: [
						{
							entryId,
							servings: parsed.data.servings,
							amount: parsed.data.amount ?? undefined,
							unit: parsed.data.unit ?? undefined,
							idempotencyKey: parsed.data.idempotencyKey,
							notes: parsed.data.notes,
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
					planId,
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
