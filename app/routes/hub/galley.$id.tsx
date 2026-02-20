import { redirect } from "react-router";
import { MealDetail } from "~/components/galley/MealDetail";
import { HubHeader } from "~/components/hub/HubHeader";
import { requireActiveGroup } from "~/lib/auth.server";
import { ITEM_DOMAINS, type ItemDomain } from "~/lib/domain";
import { deleteMeal, getMeal } from "~/lib/meals.server";
import { toSupportedUnit } from "~/lib/units";
import type { Route } from "./+types/galley.$id";

export async function loader({ request, params, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const { id } = params;
	if (!id) throw redirect("/hub/galley");

	const meal = await getMeal(context.cloudflare.env.DB, groupId, id);
	if (!meal) throw redirect("/hub/galley");

	// MealDetail expects 'MealInput & { id }'. getMeal returns database record + arrays.
	// We match the shape.

	// Sanitize for frontend types
	const sanitizedMeal = {
		...meal,
		domain: ITEM_DOMAINS.includes(meal.domain as ItemDomain)
			? (meal.domain as ItemDomain)
			: "food",
		servings: meal.servings ?? 1,
		prepTime: meal.prepTime ?? undefined,
		cookTime: meal.cookTime ?? undefined,
		description: meal.description ?? undefined,
		directions: meal.directions ?? undefined,
		equipment: Array.isArray(meal.equipment)
			? (meal.equipment as string[])
			: [],
		customFields: (meal.customFields as Record<string, string>) || {},
		ingredients: meal.ingredients.map((i) => ({
			...i,
			cargoId: i.cargoId ?? undefined,
			unit: toSupportedUnit(i.unit),
			isOptional: i.isOptional ?? false,
			orderIndex: i.orderIndex ?? 0,
		})),
	};

	return { meal: sanitizedMeal };
}

export async function action({ request, params, context }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const { id } = params;
	if (!id) throw redirect("/hub/galley");

	if (request.method === "DELETE") {
		await deleteMeal(context.cloudflare.env.DB, groupId, id);
		return redirect("/hub/galley");
	}

	// Prepare for Edit (PUT) reuse if needed, or cooked handled via api
	return null;
}

export default function MealDetailRoute({ loaderData }: Route.ComponentProps) {
	const { meal } = loaderData;

	return (
		<>
			<HubHeader
				title="PROTOCOL DETAILS"
				subtitle={`ID: ${meal.id.split("-")[0]}`}
			/>

			<MealDetail meal={meal} isOwner={true} />
		</>
	);
}
