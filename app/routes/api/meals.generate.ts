import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { inventory } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { checkBalance, deductCredits } from "~/lib/ledger.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { data } from "~/lib/response";
import type { Route } from "./+types/meals.generate";

const GENERATE_COST = 5;

// Response schema for structured output
type AIResponse = {
	recipes: Array<{
		name: string;
		description: string;
		ingredients: Array<{
			name: string;
			quantity: number;
			unit: string;
			inventoryName: string; // The match from our list
		}>;
		directions: Array<string>;
		prepTime: number;
		cookTime: number;
	}>;
};

export async function action({ request, context }: Route.ActionArgs) {
	// 1. Auth & Group Context
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);

	// 2. Rate Limiting
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"generate_meal",
		user.id,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many generation requests. Please try again later.",
			},
			{ status: 429 },
		);
	}

	// 3. Economy Check
	const balance = await checkBalance(context.cloudflare.env, groupId);
	if (balance < GENERATE_COST) {
		throw data(
			{
				error: "Insufficient credits",
				required: GENERATE_COST,
				current: balance,
			},
			{ status: 402 },
		);
	}

	// 4. Fetch Inventory
	const d1 = drizzle(context.cloudflare.env.DB);
	const pantryItems = await d1
		.select({
			name: inventory.name,
			quantity: inventory.quantity,
			unit: inventory.unit,
		})
		.from(inventory)
		.where(eq(inventory.organizationId, groupId));

	if (pantryItems.length === 0) {
		throw data(
			{ error: "Pantry is empty. Add items before generating meals." },
			{ status: 400 },
		);
	}

	// 5. Construct Prompt
	const pantryList = pantryItems
		.map((i) => `- ${i.name} (${i.quantity} ${i.unit})`)
		.join("\n");

	const systemPrompt = `You are a strict Orbital Chef. You generate recipes based ONLY on available inventory.
You have access to: Salt, Pepper, Water, Oil (Generic).

Rules:
1. You must output a JSON object with a "recipes" array containing 3 distinct meal options.
2. DO NOT hallucinate ingredients. If it's not in the list (or the 4 basics), do not use it.
3. "inventoryName" must match the exact string from the provided list for mapping.
4. Keep descriptions concise and appetizing.
`;

	const userPrompt = `Here is my current orbital pantry:
${pantryList}

Generate 3 creative meal options I can cook right now.`;

	try {
		// 6. AI Inference
		const response = await context.cloudflare.env.AI.run(
			// @ts-expect-error Llama 3.1 is supported but types might be lagging
			"@cf/meta/llama-3.1-8b-instruct",
			{
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				],
				response_format: { type: "json_object" },
			},
		);

		// biome-ignore lint/suspicious/noExplicitAny: Worker AI response type
		const aiData = response as any;
		let recipes: AIResponse["recipes"] = [];

		try {
			// Some models return strings even in JSON mode, so we parse just in case
			const parsed = typeof aiData === "string" ? JSON.parse(aiData) : aiData;
			// If wrapped in 'response', unwraps it
			const actualData = parsed.response ? JSON.parse(parsed.response) : parsed;

			if (actualData && Array.isArray(actualData.recipes)) {
				recipes = actualData.recipes;
			} else {
				console.error("AI Response structure invalid:", actualData);
				throw new Error("Invalid structure");
			}
		} catch (e) {
			console.error("Failed to parse AI response", e);
			throw data(
				{ error: "AI generation failed due to formatting error." },
				{ status: 500 },
			);
		}

		// 7. Hallucination Guard / Verification & Remapping
		const verifiedRecipes = recipes
			.map((recipe) => {
				const missingIngredients: string[] = [];

				// Check each ingredient
				for (const ing of recipe.ingredients) {
					const isBasic = ["salt", "pepper", "water", "oil"].some((b) =>
						ing.name.toLowerCase().includes(b),
					);
					if (isBasic) continue;

					const exists = pantryItems.some(
						(p) =>
							p.name.toLowerCase() === ing.inventoryName.toLowerCase() ||
							p.name.toLowerCase().includes(ing.name.toLowerCase()), // Fuzzy match fallback
					);

					if (!exists) {
						missingIngredients.push(ing.name);
					}
				}

				// Map to App Schema (ingredientName)
				const mappedIngredients = recipe.ingredients.map((ing) => ({
					ingredientName: ing.name,
					quantity: ing.quantity,
					unit: ing.unit,
					inventoryName: ing.inventoryName,
				}));

				return {
					...recipe,
					ingredients: mappedIngredients,
					missingIngredients,
				};
			})
			.filter((r) => r.missingIngredients.length <= 2); // Allow max 2 missing

		if (verifiedRecipes.length === 0) {
			throw data(
				{
					error: "Could not generate any valid recipes with current inventory.",
				},
				{ status: 422 },
			);
		}

		// 8. Deduct Credits
		await deductCredits(
			context.cloudflare.env,
			groupId,
			user.id,
			GENERATE_COST,
			"Meal Generation",
		);

		return { success: true, recipes: verifiedRecipes };
	} catch (error) {
		console.error("Analysis failed:", error);
		if (error instanceof Response) throw error;
		throw data({ error: "Internal generation error" }, { status: 500 });
	}
}
