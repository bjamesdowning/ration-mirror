import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { z } from "zod";
import { inventory } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	AI_COSTS,
	InsufficientCreditsError,
	withCreditGate,
} from "~/lib/ledger.server";
import { normalizeForMatch, tokenMatchScore } from "~/lib/matching.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/meals.generate";

const GENERATE_MODEL = "gemini-3-flash-preview";

const AIRecipeSchema = z.object({
	name: z.string().min(1),
	description: z.string().min(1),
	ingredients: z.array(
		z.object({
			name: z.string().min(1),
			quantity: z.number(),
			unit: z.string().min(1),
			inventoryName: z.string().min(1),
		}),
	),
	directions: z.array(z.string().min(1)),
	prepTime: z.number(),
	cookTime: z.number(),
});

const AIResponseSchema = z.object({
	recipes: z.array(AIRecipeSchema).min(1),
});

type AIResponse = z.infer<typeof AIResponseSchema>;

/**
 * Normalize AI output to match schema. Gemini often returns:
 * - ingredients with only inventoryName (no name)
 * - recipes without directions, prepTime, cookTime
 */
function normalizeAIResponse(parsed: unknown): unknown {
	if (!parsed || typeof parsed !== "object") return parsed;
	const obj = parsed as { recipes?: Array<Record<string, unknown>> };
	if (!Array.isArray(obj.recipes)) return parsed;

	const recipes = obj.recipes.map((recipe) => {
		const ing = Array.isArray(recipe.ingredients)
			? (recipe.ingredients as Array<Record<string, unknown>>).map(
					(i: Record<string, unknown>) => ({
						name: i.name ?? i.inventoryName ?? "unknown",
						quantity:
							typeof i.quantity === "number"
								? i.quantity
								: Number(i.quantity) || 1,
						unit: String(i.unit ?? "unit"),
						inventoryName: i.inventoryName ?? i.name ?? "unknown",
					}),
				)
			: [];
		return {
			name: recipe.name ?? "Unnamed Recipe",
			description:
				recipe.description && String(recipe.description).trim()
					? String(recipe.description)
					: "No description",
			ingredients: ing,
			directions: Array.isArray(recipe.directions) ? recipe.directions : [],
			prepTime:
				typeof recipe.prepTime === "number"
					? recipe.prepTime
					: Number(recipe.prepTime) || 0,
			cookTime:
				typeof recipe.cookTime === "number"
					? recipe.cookTime
					: Number(recipe.cookTime) || 0,
		};
	});
	return { recipes };
}

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

	// 3. Fetch Inventory
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

	// 4. Construct Prompt
	const sanitizeName = (name: string) =>
		name
			.split("")
			.filter((c) => {
				const code = c.charCodeAt(0);
				return (code >= 32 && code !== 127) || code === 9;
			})
			.join("")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 80);

	const pantryPayload = pantryItems.map((item) => ({
		name: sanitizeName(item.name),
		quantity: item.quantity,
		unit: item.unit,
	}));
	const pantryJson = JSON.stringify(pantryPayload);

	const systemPrompt = `You are a strict Orbital Chef. You generate recipes based ONLY on available inventory.
You have access to: Salt, Pepper, Water, Oil (Generic).

Rules:
1. You must output a JSON object with a "recipes" array containing 3 distinct meal options.
2. DO NOT hallucinate ingredients. If it's not in the list (or the 4 basics), do not use it.
3. "inventoryName" must match the exact string from the provided list for mapping.
4. Keep descriptions concise and appetizing.
5. Respond with ONLY the JSON object, no markdown, no extra text.
`;

	const userPrompt = `Here is my current orbital pantry in JSON:
${pantryJson}

Generate 3 creative meal options I can cook right now.`;

	try {
		return await withCreditGate(
			{
				env: context.cloudflare.env,
				organizationId: groupId,
				userId: user.id,
				cost: AI_COSTS.MEAL_GENERATE,
				reason: "Meal Generation",
			},
			async () => {
				// 5. AI Inference
				const { AI_GATEWAY_ACCOUNT_ID, AI_GATEWAY_ID, CF_AIG_TOKEN } =
					context.cloudflare.env;
				if (!AI_GATEWAY_ACCOUNT_ID || !AI_GATEWAY_ID || !CF_AIG_TOKEN) {
					throw data(
						{
							error: "Meal generation configuration missing",
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
					await response.text();
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
						},
						{ status },
					);
				}

				const payload = (await response.json()) as unknown;
				const modelText = extractModelText(payload);
				if (!modelText) {
					throw data({ error: "Meal generation failed" }, { status: 500 });
				}

				let recipes: AIResponse["recipes"] = [];

				try {
					const cleanedText = modelText
						.replace(/^```(?:json)?\s*\n?/i, "")
						.replace(/\n?```\s*$/i, "")
						.trim();
					const parsed = JSON.parse(cleanedText);
					const normalized = normalizeAIResponse(parsed);
					const parsedResult = AIResponseSchema.safeParse(normalized);
					if (!parsedResult.success) {
						throw new Error("Invalid structure");
					}
					recipes = parsedResult.data.recipes;
				} catch (e) {
					console.error("Failed to parse AI response", e);
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
									normalizeForMatch(p.name) ===
										normalizeForMatch(ingInventoryName) ||
									tokenMatchScore(p.name, ingName) >= 0.8,
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
							error:
								"Could not generate any valid recipes with current inventory.",
						},
						{ status: 422 },
					);
				}

				return { success: true, recipes: verifiedRecipes };
			},
		);
	} catch (error) {
		if (error instanceof InsufficientCreditsError) {
			const payload = {
				error: "Insufficient credits",
				required: error.required,
				...(typeof error.current === "number"
					? { current: error.current }
					: {}),
			};
			throw data(payload, { status: 402 });
		}

		if (error instanceof Response) {
			throw error;
		}

		console.error("Meal generation failed:", error);
		if (
			error &&
			typeof error === "object" &&
			"type" in error &&
			(error as { type: string }).type === "DataWithResponseInit"
		) {
			throw error as Response;
		}
		throw data({ error: "Internal generation error" }, { status: 500 });
	}
}
