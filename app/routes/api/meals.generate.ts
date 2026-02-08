import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { inventory } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { checkBalance, deductCredits } from "~/lib/ledger.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/meals.generate";

const GENERATE_COST = 5;
const GENERATE_MODEL = "gemini-3-flash-preview";

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

function extractModelText(payload: unknown) {
	if (!payload || typeof payload !== "object") return null;
	const candidates = (payload as { candidates?: Array<unknown> }).candidates;
	if (!Array.isArray(candidates) || candidates.length === 0) return null;
	const first = candidates[0] as {
		content?: { parts?: Array<{ text?: string }> };
	};
	const parts = first?.content?.parts;
	if (!Array.isArray(parts)) return null;
	for (const part of parts) {
		if (typeof part.text === "string") {
			return part.text;
		}
	}
	return null;
}

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
5. Respond with ONLY the JSON object, no markdown, no extra text.
`;

	const userPrompt = `Here is my current orbital pantry:
${pantryList}

Generate 3 creative meal options I can cook right now.`;

	try {
		// 6. AI Inference
		const { AI_GATEWAY_ACCOUNT_ID, AI_GATEWAY_ID, CF_AIG_TOKEN } =
			context.cloudflare.env;
		if (!AI_GATEWAY_ACCOUNT_ID || !AI_GATEWAY_ID || !CF_AIG_TOKEN) {
			throw data(
				{
					error: "Meal generation configuration missing",
					details:
						"AI Gateway account/id or required secrets are not configured.",
				},
				{ status: 500 },
			);
		}

		const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${AI_GATEWAY_ACCOUNT_ID}/${AI_GATEWAY_ID}/google-ai-studio`;

		const response = await fetch(
			`${gatewayUrl}/v1beta/models/${GENERATE_MODEL}:generateContent`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"cf-aig-authorization": `Bearer ${CF_AIG_TOKEN}`,
				},
				body: JSON.stringify({
					contents: [
						{
							parts: [{ text: systemPrompt }, { text: userPrompt }],
						},
					],
				}),
			},
		);
		if (!response.ok) {
			const errorText = await response.text();
			const status =
				response.status === 408 ||
				response.status === 504 ||
				response.status === 524
					? 422
					: 500;
			throw data(
				{
					error:
						status === 422
							? "Meal generation took too long. Try again."
							: "Meal generation failed",
					details: errorText,
				},
				{ status },
			);
		}

		const payload = (await response.json()) as unknown;
		const modelText = extractModelText(payload);
		if (!modelText) {
			throw data(
				{ error: "Meal generation failed", details: "Empty AI response" },
				{ status: 500 },
			);
		}

		let recipes: AIResponse["recipes"] = [];

		try {
			const cleanedText = modelText
				.replace(/^```(?:json)?\s*\n?/i, "")
				.replace(/\n?```\s*$/i, "")
				.trim();
			const parsed = JSON.parse(cleanedText) as AIResponse;
			if (parsed && Array.isArray(parsed.recipes)) {
				recipes = parsed.recipes;
			} else {
				throw new Error("Invalid structure");
			}
		} catch (e) {
			console.error("Failed to parse AI response", e);
			console.error("Raw data causing failure:", modelText);
			throw data(
				{ error: "AI generation failed due to formatting error." },
				{ status: 500 },
			);
		}

		const verifiedRecipes = recipes
			.map((recipe) => {
				const missingIngredients: string[] = [];

				const ingredients = recipe.ingredients ?? [];

				// Check each ingredient
				for (const ing of ingredients) {
					const ingName = ing.name ?? "";
					const ingInventoryName = ing.inventoryName ?? ingName;

					if (!ingName) continue; // skip malformed entries

					const isBasic = ["salt", "pepper", "water", "oil"].some((b) =>
						ingName.toLowerCase().includes(b),
					);
					if (isBasic) continue;

					const exists = pantryItems.some(
						(p) =>
							p.name.toLowerCase() === ingInventoryName.toLowerCase() ||
							p.name.toLowerCase().includes(ingName.toLowerCase()), // Fuzzy match fallback
					);

					if (!exists) {
						missingIngredients.push(ingName);
					}
				}

				// Map to App Schema (ingredientName)
				const mappedIngredients = ingredients.map((ing) => ({
					ingredientName: ing.name ?? "unknown",
					quantity: ing.quantity ?? 1,
					unit: ing.unit ?? "unit",
					inventoryName: ing.inventoryName ?? ing.name ?? "unknown",
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
		if (
			error instanceof Response ||
			(error &&
				typeof error === "object" &&
				"type" in error &&
				(error as { type: string }).type === "DataWithResponseInit")
		) {
			throw error;
		}
		throw data({ error: "Internal generation error" }, { status: 500 });
	}
}
