import type { AppLoadContext } from "react-router";
import { z } from "zod";
import { handleApiError } from "~/lib/error-handler";
import {
	buildMobileFlagContext,
	type FlagshipEvaluationContext,
} from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { assertPlanFuelActions } from "~/lib/nutrition/fast-log-flag.server";
import type { NutritionPrincipal } from "~/lib/nutrition/service.server";
import { addCargoToFuel } from "~/lib/plan-fuel-actions.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { FuelTimeZoneSchema } from "~/lib/schemas/fuel";
import { IntakeNotesSchema } from "~/lib/schemas/manifest";
import { UuidSchema } from "~/lib/schemas/uuid";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.cargo.$id.add-to-fuel";

const Body = z.object({
	quantity: z.number().positive(),
	operationKey: UuidSchema,
	idempotencyKey: UuidSchema.optional(),
	fuelTimeZone: FuelTimeZoneSchema.optional(),
	occurredAt: z.string().optional(),
	notes: IntakeNotesSchema.optional(),
	energyKcal: z.number().finite().nonnegative().optional(),
});

/**
 * POST /api/mobile/v1/cargo/:id/add-to-fuel — deduct and log. No provision, no plan row.
 * Bearer is the iOS app and the Eat widget. A session cookie is the web hub.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	const cargoId = params.id;
	if (!cargoId) methodNotAllowed();
	if (request.headers.get("Authorization")?.startsWith("Bearer ")) {
		return bearerFuel(request, context, cargoId);
	}
	return withDiary(
		{ request, context },
		"web",
		"settings_mutation",
		async (started) =>
			commitFuel(
				started.env,
				started.principal,
				started.flags,
				cargoId,
				request,
			),
	);
}

async function bearerFuel(
	request: Request,
	context: AppLoadContext,
	cargoId: string,
) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;
		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"settings_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}
		const flags = buildMobileFlagContext(request, env, {
			user: { id: userId },
		});
		const principal: NutritionPrincipal = {
			userId,
			organizationId,
			surface: "mobile",
			authMethod: "mobile_bearer",
			scopes: ["nutrition:read", "nutrition:write"],
			requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
		};
		return commitFuel(env, principal, flags, cargoId, request);
	} catch (error) {
		return handleApiError(error);
	}
}

async function commitFuel(
	env: Env,
	principal: NutritionPrincipal,
	flags: FlagshipEvaluationContext,
	cargoId: string,
	request: Request,
) {
	await assertPlanFuelActions(env, flags);
	const body = Body.parse(await request.json());
	return addCargoToFuel(
		env,
		principal.organizationId,
		cargoId,
		body.quantity,
		principal,
		flags,
		{
			operationKey: body.operationKey,
			idempotencyKey: body.idempotencyKey ?? body.operationKey,
			fuelTimeZone: body.fuelTimeZone,
			occurredAt: body.occurredAt ?? new Date().toISOString(),
			notes: body.notes,
			energyKcal: body.energyKcal,
		},
	);
}
