import { redirect } from "react-router";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { MealBuilder } from "~/components/galley/MealBuilder";
import { requireAuth } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { parseFormData } from "~/lib/form-utils";
import { getInventory } from "~/lib/inventory.server";
import { createMeal } from "~/lib/meals.server";
import { MealSchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/meals.new";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { user } = await requireAuth(context, request);
	const inventory = await getInventory(context.cloudflare.env.DB, user.id);
	return { inventory };
}

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
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
		const meal = await createMeal(context.cloudflare.env.DB, user.id, input);
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
