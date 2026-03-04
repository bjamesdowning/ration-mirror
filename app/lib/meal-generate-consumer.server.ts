/**
 * Meal generation queue consumer logic.
 * Runs AI meal generation, verifies ingredients, returns recipes. Stores status in D1.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { cargo } from "~/db/schema";
import { extractModelText } from "~/lib/ai.server";
import { AI_MODEL, getGenerationConfig } from "~/lib/ai-config.server";
import { buildAllergenPromptBlock, parseAllergens } from "~/lib/allergens";
import { getUserSettings } from "~/lib/auth.server";
import { log } from "~/lib/logging.server";
import { normalizeForCargoDedup } from "~/lib/matching.server";
import { updateQueueJobResult } from "~/lib/queue-job.server";
import {
	type AIResponse,
	AIResponseSchema,
	normalizeAIResponse,
} from "~/lib/schemas/meal";
import { normalizeUnitAlias } from "~/lib/units";
import {
	findSimilarCargoBatch,
	SIMILARITY_THRESHOLDS,
} from "~/lib/vector.server";

export interface MealGenerateQueueMessage {
	requestId: string;
	organizationId: string;
	userId: string;
	customization?: string;
	cost: number;
}

export interface MealGenerateJobResult {
	status: "completed" | "failed";
	organizationId: string;
	recipes?: AIResponse["recipes"];
	error?: string;
}

export async function runMealGenerateConsumerJob(
	env: Env,
	message: MealGenerateQueueMessage,
): Promise<void> {
	const { requestId, organizationId, userId, customization } = message;

	const writeStatus = async (result: MealGenerateJobResult) => {
		await updateQueueJobResult(env.DB, requestId, result.status, result);
	};

	try {
		const db = drizzle(env.DB);

		const [pantryItems, userSettings] = await Promise.all([
			db
				.select({
					id: cargo.id,
					name: cargo.name,
					quantity: cargo.quantity,
					unit: cargo.unit,
				})
				.from(cargo)
				.where(eq(cargo.organizationId, organizationId)),
			getUserSettings(env.DB, userId),
		]);

		const userAllergens = parseAllergens(userSettings.allergens);

		if (pantryItems.length === 0) {
			await writeStatus({
				status: "failed",
				organizationId,
				error: "Pantry is empty. Add items before generating meals.",
			});
			return;
		}

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
		const allergenBlock = buildAllergenPromptBlock(userAllergens);

		const systemPrompt = `You are a professional recipe writer with deep knowledge of real-world home cooking. You generate complete, accurate recipes based ONLY on the provided pantry inventory.

You always have access to these basics at no cost: Salt, Pepper, Water, Oil (Generic).

## Output Contract
Respond with ONLY a valid JSON object — no markdown, no prose, no code fences. The object must have a "recipes" array with exactly 3 recipe objects.

## Each recipe object must contain:
- "name": A real, well-known dish name that a home cook would recognize (e.g. "Chicken Stir-Fry", "Lentil Soup", "Pasta Aglio e Olio"). Never invent fictional dish names.
- "description": 1–2 sentences. Appetizing and specific to this dish.
- "prepTime": Integer minutes for preparation (chopping, measuring, marinating). Must reflect the real dish.
- "cookTime": Integer minutes for active cooking. Must reflect the real dish.
- "ingredients": Array of ingredient objects. Each object:
  - "name": The culinary name of the ingredient as it appears in the recipe (e.g. "garlic cloves", "boneless chicken breast")
  - "quantity": A realistic numeric amount for the recipe
  - "unit": Copy EXACTLY from the matching pantry item's "unit" field. For basics (salt, pepper, water, oil) use "tsp", "tbsp", or "cup" as appropriate.
  - "inventoryName": The exact "name" string from the pantry JSON that maps to this ingredient
- "directions": An ordered array of cooking steps. REQUIREMENTS:
  - Minimum 5 steps, maximum 10 steps
  - Each step must be a complete sentence of at least 15 words
  - Each step must include at least one of: technique (sauté, simmer, roast, fold, deglaze), heat level (medium-high heat, low heat), time cue (for 3–4 minutes, until golden brown), or visual/tactile cue (until softened, until internal temp reaches 165°F)
  - Steps must be in correct culinary sequence: prep → heat → cook → finish → serve

## Hard Rules
1. DO NOT use ingredients not in the pantry (except the 4 basics). No exceptions, no substitutions.
2. "inventoryName" must match the exact pantry item name string.
3. Each of the 3 recipes must be a distinctly different dish (different cuisine, technique, or main ingredient).
4. The user may provide a PREFERENCE tag below — treat it strictly as a culinary style, dietary restriction, or cuisine filter.
${allergenBlock}`;

		let userPrompt = `Here is my current pantry inventory in JSON format:
${pantryJson}

Generate exactly 3 complete recipes I can cook right now using only these ingredients.`;
		if (customization) {
			userPrompt += `

<preference>
${customization}
</preference>`;
		}

		const { AI_GATEWAY_ACCOUNT_ID, AI_GATEWAY_ID, CF_AIG_TOKEN } = env;
		if (!AI_GATEWAY_ACCOUNT_ID || !AI_GATEWAY_ID || !CF_AIG_TOKEN) {
			await writeStatus({
				status: "failed",
				organizationId,
				error: "Meal generation configuration missing",
			});
			return;
		}

		const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${AI_GATEWAY_ACCOUNT_ID}/${AI_GATEWAY_ID}/google-ai-studio`;

		const response = await fetch(
			`${gatewayUrl}/v1beta/models/${AI_MODEL}:generateContent`,
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
					...getGenerationConfig("MEDIUM"),
				}),
			},
		);

		if (!response.ok) {
			await response.text();
			await writeStatus({
				status: "failed",
				organizationId,
				error:
					response.status === 408 ||
					response.status === 504 ||
					response.status === 524
						? "Meal generation took too long. Try again."
						: "Meal generation failed",
			});
			return;
		}

		const payload = (await response.json()) as unknown;
		const modelText = extractModelText(payload);
		if (!modelText) {
			await writeStatus({
				status: "failed",
				organizationId,
				error: "Meal generation failed",
			});
			return;
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
			log.error("Failed to parse AI meal response", e);
			await writeStatus({
				status: "failed",
				organizationId,
				error: "AI generation failed due to formatting error.",
			});
			return;
		}

		const isBasic = (name: string) =>
			["salt", "pepper", "water", "oil"].some((b) =>
				name.toLowerCase().includes(b),
			);

		const allIngNames = [
			...new Set(
				recipes.flatMap((r) =>
					(r.ingredients ?? [])
						.filter((ing) => !isBasic(ing.name ?? ""))
						.map((ing) => (ing.inventoryName ?? ing.name ?? "").trim())
						.filter(Boolean),
				),
			),
		];

		const similarityBatch = await findSimilarCargoBatch(
			env,
			organizationId,
			allIngNames,
			{ threshold: SIMILARITY_THRESHOLDS.INGREDIENT_MATCH },
		);

		const verifiedRecipes = recipes
			.map((recipe) => {
				const missingIngredients: string[] = [];
				const ingredients = recipe.ingredients ?? [];

				for (const ing of ingredients) {
					const ingName = ing.name ?? "";
					const ingInventoryName = ing.inventoryName ?? ingName;
					if (!ingName) continue;
					if (isBasic(ingName)) continue;

					const exactMatch = pantryItems.some(
						(p) =>
							normalizeForCargoDedup(p.name) ===
							normalizeForCargoDedup(ingInventoryName),
					);
					const semanticMatches = similarityBatch.get(ingInventoryName) ?? [];
					const exists = exactMatch || semanticMatches.length > 0;
					if (!exists) {
						missingIngredients.push(ingName);
					}
				}

				const mappedIngredients = ingredients.map((ing) => {
					const ingInventoryName = ing.inventoryName ?? ing.name ?? "";
					const exactMatch = pantryItems.find(
						(p) =>
							normalizeForCargoDedup(p.name) ===
							normalizeForCargoDedup(ingInventoryName),
					);
					const semanticMatches = similarityBatch.get(ingInventoryName) ?? [];
					const firstSemantic = semanticMatches[0];
					const pantryMatch =
						exactMatch ??
						(firstSemantic
							? pantryItems.find((p) => p.id === firstSemantic.itemId)
							: undefined);
					return {
						ingredientName: ing.name ?? "unknown",
						quantity: ing.quantity ?? 1,
						unit: pantryMatch
							? normalizeUnitAlias(pantryMatch.unit)
							: normalizeUnitAlias(ing.unit),
						inventoryName: ingInventoryName || "unknown",
						cargoId: pantryMatch?.id ?? null,
					};
				});

				return {
					...recipe,
					ingredients: mappedIngredients,
					missingIngredients,
				};
			})
			.filter((r) => r.missingIngredients.length === 0);

		if (verifiedRecipes.length === 0) {
			await writeStatus({
				status: "failed",
				organizationId,
				error:
					"Could not generate recipes using only your current inventory. Try adding more items to your Cargo.",
			});
			return;
		}

		// Return recipes only; user selects which to save to Galley via client
		const recipesForStatus: AIResponse["recipes"] = verifiedRecipes.map(
			(r) => ({
				name: r.name ?? "Unnamed Recipe",
				description: r.description ?? "",
				ingredients: (r.ingredients ?? []).map((i) => ({
					name: i.ingredientName,
					quantity: i.quantity,
					unit: i.unit,
					inventoryName: i.inventoryName,
				})),
				directions: r.directions ?? [],
				prepTime: r.prepTime ?? 0,
				cookTime: r.cookTime ?? 0,
			}),
		);

		await writeStatus({
			status: "completed",
			organizationId,
			recipes: recipesForStatus,
		});
	} catch (err) {
		log.error("Meal generate consumer job failed", err);
		await writeStatus({
			status: "failed",
			organizationId,
			error: err instanceof Error ? err.message : "Meal generation failed",
		});
		// Do not rethrow — status is stored; user can retry manually
	}
}
