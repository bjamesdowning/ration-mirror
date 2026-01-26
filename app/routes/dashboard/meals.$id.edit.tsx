import { data, redirect } from "react-router";
import { z } from "zod";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { MealBuilder } from "~/components/galley/MealBuilder";
import { requireAuth } from "~/lib/auth.server";
import { getMeal, updateMeal } from "~/lib/meals.server";
import { MealSchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/meals.$id.edit";

// Reuse parseFormData from new.tsx or extract it.
// Copying for now to be self-contained in route logic.
function parseFormData(formData: FormData) {
	const obj: Record<string, unknown> = {};
	for (const [key, value] of formData.entries()) {
		if (key.includes("[")) {
			const match = key.match(/^(\w+)\[(\d+)\]\.(\w+)$/);
			if (match) {
				const [_, root, index, field] = match;
				if (!obj[root]) obj[root] = [];
				const rootArray = obj[root] as Record<string, unknown>[];
				const idx = Number.parseInt(index, 10);
				if (!rootArray[idx]) rootArray[idx] = {};
				rootArray[idx][field] = value;
				continue;
			}
		}
		obj[key] = value;
	}
	if (Array.isArray(obj.ingredients)) {
		obj.ingredients = obj.ingredients.filter(Boolean);
	}
	return obj;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
	const { user } = await requireAuth(context, request);
	const { id } = params;
	if (!id) throw redirect("/dashboard/meals");

	const meal = await getMeal(context.cloudflare.env.DB, user.id, id);
	if (!meal) throw redirect("/dashboard/meals");

	// Sanitize for frontend types (null -> undefined)
	const sanitizedMeal = {
		...meal,
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
			inventoryId: i.inventoryId ?? undefined,
			isOptional: i.isOptional ?? false,
			orderIndex: i.orderIndex ?? 0,
		})),
	};

	return { meal: sanitizedMeal };
}

export async function action({ request, params, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const { id } = params;
	if (!id) throw redirect("/dashboard/meals");

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
		// Using meals service update
		await updateMeal(context.cloudflare.env.DB, user.id, id, input);

		return redirect(`/dashboard/meals/${id}`);
	} catch (e) {
		if (e instanceof z.ZodError) {
			return data({ errors: e.flatten() }, { status: 400 });
		}
		console.error(e);
		return data({ error: "Server Error" }, { status: 500 });
	}
}

export default function EditMeal({ loaderData }: Route.ComponentProps) {
	const { meal } = loaderData;

	return (
		<>
			<DashboardHeader
				title="UPDATE PROTOCOL"
				subtitle={`TARGET: ${meal.name}`}
			/>
			<div className="max-w-4xl mx-auto border border-[#39FF14]/30 bg-[#051105]/50 p-8">
				<MealBuilder
					defaultValue={meal}
					method="post"
					// Action in Builder defaults to current URL which is correct.
					// method should be POST, which action handles as Update.
					// Usually Update uses PUT but HTML Forms support POST.
					// Our loader/action handles POST for update logic here.
					// Wait, previous API was PUT.
					// But here we are in a Route Action. Route Action receives POST from <Form>.
					// So we handle POST in action and call updateMeal.
				/>
			</div>
		</>
	);
}
