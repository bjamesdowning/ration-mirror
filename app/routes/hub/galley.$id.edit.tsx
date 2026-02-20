import { redirect } from "react-router";
import { MealBuilder } from "~/components/galley/MealBuilder";
import { HubHeader } from "~/components/hub/HubHeader";
import { requireActiveGroup } from "~/lib/auth.server";
import { getCargo } from "~/lib/cargo.server";
import { ITEM_DOMAINS, type ItemDomain } from "~/lib/domain";
import { handleApiError } from "~/lib/error-handler";
import { parseFormData } from "~/lib/form-utils";
import { getMeal, updateMeal } from "~/lib/meals.server";
import { MealSchema } from "~/lib/schemas/meal";
import { toSupportedUnit } from "~/lib/units";
import type { Route } from "./+types/galley.$id.edit";

export async function loader({ request, params, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const { id } = params;
	if (!id) throw redirect("/hub/galley");

	const meal = await getMeal(context.cloudflare.env.DB, groupId, id);
	if (!meal) throw redirect("/hub/galley");

	const cargo = await getCargo(context.cloudflare.env.DB, groupId);

	// Sanitize for frontend types (null -> undefined)
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

	return { meal: sanitizedMeal, cargo };
}

export async function action({ request, params, context }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const { id } = params;
	if (!id) throw redirect("/hub/galley");

	const contentType = request.headers.get("Content-Type");
	let inputData: unknown;

	try {
		if (contentType?.includes("application/json")) {
			inputData = await request.json();
		} else {
			const formData = await request.formData();
			inputData = parseFormData(formData);
		}

		const input = MealSchema.parse(inputData);
		await updateMeal(context.cloudflare.env.DB, groupId, id, input);

		return redirect(`/hub/galley/${id}`);
	} catch (e) {
		return handleApiError(e);
	}
}

export default function EditMeal({ loaderData }: Route.ComponentProps) {
	const { meal } = loaderData;

	return (
		<>
			<HubHeader title="Edit Meal" subtitle={meal.name} />
			<div className="max-w-4xl mx-auto glass-panel rounded-2xl p-8">
				<MealBuilder
					defaultValue={meal}
					availableIngredients={loaderData.cargo}
					method="post"
				/>
			</div>
		</>
	);
}
