import { Link, redirect } from "react-router";
import { MealDetail } from "~/components/galley/MealDetail";
import { HubHeader } from "~/components/hub/HubHeader";
import { DetailNavRocker } from "~/components/shell/DetailNavRocker";
import { parseAllergens } from "~/lib/allergens";
import { requireActiveGroup } from "~/lib/auth.server";
import { ITEM_DOMAINS, type ItemDomain } from "~/lib/domain";
import { getActiveMealSelections } from "~/lib/meal-selection.server";
import { deleteMeal, getAdjacentMealIds, getMeal } from "~/lib/meals.server";
import { toSupportedUnit } from "~/lib/units";
import type { Route } from "./+types/galley.$id";

export async function loader({ request, params, context }: Route.LoaderArgs) {
	const { session, groupId } = await requireActiveGroup(context, request);
	const { id } = params;
	if (!id) throw redirect("/hub/galley");

	const url = new URL(request.url);
	const tag = url.searchParams.get("tag")?.trim().slice(0, 100) ?? undefined;
	const domainParam = url.searchParams.get("domain");
	const domain =
		domainParam &&
		ITEM_DOMAINS.includes(domainParam as (typeof ITEM_DOMAINS)[number])
			? domainParam
			: undefined;

	const rawSettings = session.user.settings;
	let userAllergens: ReturnType<typeof parseAllergens> = [];
	if (rawSettings) {
		try {
			const parsed =
				typeof rawSettings === "string" ? JSON.parse(rawSettings) : rawSettings;
			userAllergens = parseAllergens(parsed?.allergens);
		} catch {}
	}

	const meal = await getMeal(context.cloudflare.env.DB, groupId, id);
	if (!meal) throw redirect("/hub/galley");

	const [activeSelections, adjacent] = await Promise.all([
		getActiveMealSelections(context.cloudflare.env.DB, groupId),
		getAdjacentMealIds(
			context.cloudflare.env.DB,
			groupId,
			{ id: meal.id, createdAt: meal.createdAt },
			{ tag, domain },
		),
	]);

	const isSelectedForSupply = activeSelections.some((s) => s.mealId === id);

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

	return {
		meal: sanitizedMeal,
		userAllergens,
		isSelectedForSupply,
		prevId: adjacent.prevId,
		nextId: adjacent.nextId,
		navTag: tag,
		navDomain: domain,
	};
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
	const {
		meal,
		userAllergens,
		isSelectedForSupply,
		prevId,
		nextId,
		navTag,
		navDomain,
	} = loaderData;

	return (
		<>
			<HubHeader
				title="PROTOCOL DETAILS"
				subtitle={`ID: ${meal.id.split("-")[0]}`}
			/>
			<div className="flex items-center justify-between mb-6">
				<Link
					to="/hub/galley"
					className="text-sm text-muted hover:text-hyper-green transition-colors"
				>
					← Back to Galley
				</Link>
				<DetailNavRocker
					prevId={prevId}
					nextId={nextId}
					basePath="/hub/galley"
					tag={navTag}
					domain={navDomain}
					itemLabel="recipe"
				/>
			</div>
			<MealDetail
				meal={meal}
				isOwner={true}
				userAllergens={userAllergens}
				isSelectedForSupply={isSelectedForSupply}
			/>
		</>
	);
}
