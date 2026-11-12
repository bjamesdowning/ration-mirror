import { z } from "zod";
import { assertPlanFuelActions } from "~/lib/nutrition/fast-log-flag.server";
import { addMealToFuel } from "~/lib/plan-fuel-actions.server";
import { FuelTimeZoneSchema } from "~/lib/schemas/fuel";
import { IntakeNotesSchema } from "~/lib/schemas/manifest";
import { UuidSchema } from "~/lib/schemas/uuid";
import { methodNotAllowed, withDiary } from "../nutrition.diary.shared";
import type { Route } from "./+types/v1.meals.$id.add-to-fuel";

const Body = z.object({
	servings: z.number().positive(),
	confirmInsufficient: z.boolean().optional(),
	operationKey: UuidSchema,
	idempotencyKey: UuidSchema.optional(),
	fuelTimeZone: FuelTimeZoneSchema.optional(),
	occurredAt: z.string().optional(),
	notes: IntakeNotesSchema.optional(),
	energyKcal: z.number().finite().nonnegative().optional(),
});

/** POST /api/mobile/v1/meals/:id/add-to-fuel — deduct ingredients and log. No plan row. */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") methodNotAllowed();
	const mealId = params.id;
	if (!mealId) methodNotAllowed();
	return withDiary(
		{ request, context },
		"mobile",
		"settings_mutation",
		async (started) => {
			await assertPlanFuelActions(started.env, started.flags);
			const body = Body.parse(await request.json());
			return addMealToFuel(
				started.env,
				started.principal.organizationId,
				mealId,
				body.servings,
				body.confirmInsufficient === true,
				started.principal,
				started.flags,
				{
					operationKey: body.operationKey,
					idempotencyKey: body.idempotencyKey ?? body.operationKey,
					fuelTimeZone: body.fuelTimeZone,
					occurredAt: body.occurredAt ?? new Date().toISOString(),
					notes: body.notes,
					energyKcal: body.energyKcal,
				},
			);
		},
	);
}
