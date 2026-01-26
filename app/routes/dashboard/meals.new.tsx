import { data, redirect } from "react-router";
import { z } from "zod";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { MealBuilder } from "~/components/galley/MealBuilder";
import { requireAuth } from "~/lib/auth.server";
import { createMeal } from "~/lib/meals.server";
import { MealSchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/meals.new";

// Helper to parse nested form data (e.g. ingredients[0].name)
// Since we don't have a library for this, we'll parse JSON if client sends JSON,
// OR if standard Form submission, we need a parser.
// MealBuilder by default uses standard Form inputs.
// We should use a client-side submit handler in MealBuilder if we want to send JSON, OR parse formData on server.
// Simplest is generic formData parser or use existing 'remix-params-helper' or similar if available.
// Given constraints, let's assume MealBuilder sends JSON via useSubmit?
// Actually MealBuilder uses <Form>.
// Let's implement a simple formData parser for nested array or change MealBuilder to use JSON submission.
// RECOMMENDATION: Update MealBuilder to use `useSubmit` and send JSON to simplify nested data handling on server.
// I will create the server action to expect JSON if intent is present, or try to handle standard form data.
// Wait, I can't easily change MealBuilder now without another step.
// I'll stick to Form.
// But standard FormData doesn't handle objects/arrays structure automatically.
// I'll assume for now I can parse it or I will handle it in MealBuilder.

// Let's UPDATE MealBuilder to use JSON submission for complex data.
// But I already wrote MealBuilder.
// I'll update the Action to handle standard FormData manually for phase 1 or expect JSON.
// Better: Update MealBuilder in a future step if needed.
// For now, I'll attempt to parse FormData.
// `ingredients[0].name` -> inputs.

// I'll implement a basic parser for `ingredients[index].field`

function parseFormData(formData: FormData) {
	const obj: Record<string, unknown> = {};
	for (const [key, value] of formData.entries()) {
		if (key.includes("[")) {
			// naive regex for array: ingredients[0].name
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
	// Filter empty array slots if any
	if (Array.isArray(obj.ingredients)) {
		obj.ingredients = obj.ingredients.filter(Boolean);
	}
	return obj;
}

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);

	// Check content type
	const contentType = request.headers.get("Content-Type");
	let inputData: unknown;

	try {
		if (contentType?.includes("application/json")) {
			inputData = await request.json();
		} else {
			const formData = await request.formData();
			inputData = parseFormData(formData);
			// Handle numeric coercions manually or let Zod handle it (Zod coerce)
		}

		const input = MealSchema.parse(inputData);
		const meal = await createMeal(context.cloudflare.env.DB, user.id, input);
		if (!meal) throw new Error("Failed to create meal");
		return redirect(`/dashboard/meals/${meal.id}`);
	} catch (e) {
		if (e instanceof z.ZodError) {
			return data({ errors: e.flatten() }, { status: 400 });
		}
		console.error(e);
		return data({ error: "Server Error" }, { status: 500 });
	}
}

export default function NewMeal() {
	return (
		<>
			<DashboardHeader title="NEW PROTOCOL" subtitle="INITIALIZATION" />
			<div className="max-w-4xl mx-auto border border-[#39FF14]/30 bg-[#051105]/50 p-8">
				<MealBuilder />
			</div>
		</>
	);
}
