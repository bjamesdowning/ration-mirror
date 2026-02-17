import { data, redirect } from "react-router";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { MealBuilder } from "~/components/galley/MealBuilder";
import { requireActiveGroup } from "~/lib/auth.server";
import { checkCapacity } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { parseFormData } from "~/lib/form-utils";
import { getInventory } from "~/lib/inventory.server";
import { createMeal, createMeals, MAX_BATCH_MEALS } from "~/lib/meals.server";
import { MealSchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/meals.new";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const inventory = await getInventory(context.cloudflare.env.DB, groupId);
	return { inventory };
}

export async function action({ request, context }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const contentType = request.headers.get("Content-Type");
	let inputData: unknown;

	try {
		if (contentType?.includes("application/json")) {
			inputData = await request.json();
		} else {
			const formData = await request.formData();
			inputData = parseFormData(formData);
		}

		if (Array.isArray(inputData)) {
			if (inputData.length > MAX_BATCH_MEALS) {
				throw data(
					{
						error: `Cannot create more than ${MAX_BATCH_MEALS} meals at once`,
					},
					{ status: 400 },
				);
			}
			const inputs = inputData.map((item) => MealSchema.parse(item));
			const capacity = await checkCapacity(
				context.cloudflare.env,
				groupId,
				"meals",
				inputs.length,
			);
			if (!capacity.allowed) {
				throw data(
					{
						error: "capacity_exceeded",
						resource: "meals",
						current: capacity.current,
						limit: capacity.limit,
						tier: capacity.tier,
						isExpired: capacity.isExpired,
						canAdd: capacity.canAdd,
						upgradePath: "crew_member",
					},
					{ status: 403 },
				);
			}
			const meals = await createMeals(
				context.cloudflare.env.DB,
				groupId,
				inputs,
			);
			if (meals.length === 0) throw new Error("Failed to create meals");
			return redirect("/dashboard/meals");
		}

		const input = MealSchema.parse(inputData);
		const capacity = await checkCapacity(
			context.cloudflare.env,
			groupId,
			"meals",
			1,
		);
		if (!capacity.allowed) {
			throw data(
				{
					error: "capacity_exceeded",
					resource: "meals",
					current: capacity.current,
					limit: capacity.limit,
					tier: capacity.tier,
					isExpired: capacity.isExpired,
					canAdd: capacity.canAdd,
					upgradePath: "crew_member",
				},
				{ status: 403 },
			);
		}
		const meal = await createMeal(context.cloudflare.env.DB, groupId, input);
		if (!meal) throw new Error("Failed to create meal");
		return redirect(`/dashboard/meals/${meal.id}`);
	} catch (e) {
		return handleApiError(e);
	}
}

export default function NewMeal({ loaderData }: Route.ComponentProps) {
	return (
		<>
			<DashboardHeader title="New Recipe" subtitle="Create a new meal" />
			<div className="max-w-4xl mx-auto glass-panel rounded-2xl p-8">
				<MealBuilder availableIngredients={loaderData?.inventory} />
			</div>
		</>
	);
}
