import { data } from "react-router";
import type { z } from "zod";
import type { ItemDomain } from "~/lib/domain";
import { handleApiError } from "~/lib/error-handler";
import { getActiveMealSelections } from "~/lib/meal-selection.server";
import { deleteMeal, getMeal, updateMeal } from "~/lib/meals.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { MealInput } from "~/lib/schemas/meal";
import { MobileUpdateMealSchema } from "~/lib/schemas/mobile/meals";
import { UnitSchema } from "~/lib/schemas/units";
import type { Route } from "./+types/v1.meals.$id";

type MobileUpdateMealPatch = z.infer<typeof MobileUpdateMealSchema>;

function mergeMealPatch(
	existing: NonNullable<Awaited<ReturnType<typeof getMeal>>>,
	patch: MobileUpdateMealPatch,
): MealInput {
	return {
		name: patch.name ?? existing.name,
		domain: (patch.domain ?? existing.domain) as ItemDomain,
		description: patch.description ?? existing.description ?? undefined,
		directions: patch.directions ?? existing.directions ?? undefined,
		equipment:
			patch.equipment ??
			(Array.isArray(existing.equipment) ? existing.equipment : []),
		servings: patch.servings ?? existing.servings ?? 1,
		prepTime: patch.prepTime ?? existing.prepTime ?? undefined,
		cookTime: patch.cookTime ?? existing.cookTime ?? undefined,
		customFields:
			patch.customFields ??
			(typeof existing.customFields === "object" && existing.customFields
				? (existing.customFields as Record<string, string>)
				: {}),
		ingredients:
			patch.ingredients ??
			existing.ingredients.map((ing) => ({
				ingredientName: ing.ingredientName,
				quantity: ing.quantity,
				unit: UnitSchema.parse(ing.unit),
				cargoId: ing.cargoId ?? undefined,
				isOptional: ing.isOptional ?? false,
				orderIndex: ing.orderIndex ?? 0,
			})),
		tags: patch.tags ?? existing.tags,
	};
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
	try {
		const { organizationId } = await requireMobileActiveGroup(context, request);
		const id = params.id;
		if (!id) throw data({ error: "Not Found" }, { status: 404 });

		const meal = await getMeal(context.cloudflare.env.DB, organizationId, id);
		if (!meal) throw data({ error: "Not Found" }, { status: 404 });

		const selections = await getActiveMealSelections(
			context.cloudflare.env.DB,
			organizationId,
		);
		const selection = selections.find((s) => s.mealId === id);

		return {
			meal,
			isSelectedForSupply: Boolean(selection),
			servingsOverride: selection?.servingsOverride ?? null,
		};
	} catch (e) {
		return handleApiError(e);
	}
}

export async function action({ request, context, params }: Route.ActionArgs) {
	const id = params.id;
	if (!id) throw data({ error: "Not Found" }, { status: 404 });

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
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		if (request.method === "PATCH") {
			const body = await request.json();
			const patch = MobileUpdateMealSchema.parse(body);
			const existing = await getMeal(
				context.cloudflare.env.DB,
				organizationId,
				id,
			);
			if (!existing) throw data({ error: "Not Found" }, { status: 404 });
			const merged = mergeMealPatch(existing, patch);
			const meal = await updateMeal(
				context.cloudflare.env.DB,
				organizationId,
				id,
				merged,
			);
			return { meal };
		}

		if (request.method === "DELETE") {
			await deleteMeal(context.cloudflare.env.DB, organizationId, id);
			return { success: true };
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
