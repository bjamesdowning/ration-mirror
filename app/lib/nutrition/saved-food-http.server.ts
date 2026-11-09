import { data } from "react-router";
import {
	DeleteSavedFoodSchema,
	SaveFoodSchema,
} from "~/lib/schemas/saved-food";
import { assertNutritionSavedFood } from "./fast-log-flag.server";
import { deleteSavedFood, listSavedFoods, saveFood } from "./saved-food.server";
import type {
	NutritionFlagContext,
	NutritionPrincipal,
} from "./service.server";
import { requireScope } from "./service.server";

async function readBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw data({ error: "Invalid request" }, { status: 400 });
	}
}

export async function getSavedFoodList(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	requireScope(principal, "nutrition:read");
	await assertNutritionSavedFood(env, flags);
	return { savedFoods: await listSavedFoods(env.DB, principal.userId) };
}

export async function postSavedFood(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	requireScope(principal, "nutrition:write");
	await assertNutritionSavedFood(env, flags);
	const parsed = SaveFoodSchema.safeParse(await readBody(request));
	if (!parsed.success) {
		throw data(
			{ error: "Invalid request", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}
	return saveFood(env.DB, principal.userId, parsed.data);
}

export async function deleteSavedFoodRequest(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	savedFoodId: string,
) {
	requireScope(principal, "nutrition:write");
	await assertNutritionSavedFood(env, flags);
	const parsed = DeleteSavedFoodSchema.safeParse(await readBody(request));
	if (!parsed.success) {
		throw data(
			{
				error: "Pass confirm:true before deleting a saved food.",
				code: "confirmation_required",
			},
			{ status: 400 },
		);
	}
	return deleteSavedFood(env.DB, principal.userId, savedFoodId);
}
