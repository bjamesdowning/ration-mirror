/**
 * Agent vs card projections for shared MCP/Copilot tool results.
 * MCP and Copilot model messages use `agent`. Copilot cards may pass `card`.
 */

import type { ToolMeta } from "./envelope";

export type ResponseProfile = "agent" | "card";

const MACRO_KEYS = new Set([
	"energyKcal",
	"proteinG",
	"carbsG",
	"fatG",
	"fiberG",
	"sugarG",
	"satFatG",
	"sodiumMg",
	"saltG",
	"carbG",
]);

const NUTRIENT_HINT_KEYS = new Set([
	"energyKcal",
	"proteinG",
	"fatG",
	"carbG",
	"carbsG",
	"fiberG",
]);

export function roundMacro(value: number): number {
	if (!Number.isFinite(value)) return value;
	return Math.round(value * 1000) / 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function looksLikeNutrients(record: Record<string, unknown>): boolean {
	for (const key of NUTRIENT_HINT_KEYS) {
		if (key in record) return true;
	}
	return false;
}

function isOpaqueKeyName(value: string, apiKeyId: unknown): boolean {
	if (typeof apiKeyId === "string" && value === apiKeyId) return true;
	if (
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			value,
		)
	) {
		return true;
	}
	return (
		value.startsWith("oauth:") ||
		value.startsWith("copilot:") ||
		value.startsWith("key-")
	);
}

function projectTags(tags: unknown, profile: ResponseProfile): unknown {
	if (!Array.isArray(tags)) return tags;
	if (profile === "card") return tags;
	return tags.map((tag) => {
		if (!isRecord(tag)) return tag;
		const slim: Record<string, unknown> = {};
		if (typeof tag.slug === "string") slim.slug = tag.slug;
		if (typeof tag.name === "string") slim.name = tag.name;
		if (Object.keys(slim).length === 0) return tag;
		return slim;
	});
}

function projectNode(
	value: unknown,
	profile: ResponseProfile,
	tool: string,
	keepDetail: boolean,
): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => projectNode(item, profile, tool, keepDetail));
	}
	if (!isRecord(value)) {
		return value;
	}

	const next: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (
			profile === "agent" &&
			!keepDetail &&
			(key === "attributions" || key === "computedAt" || key === "recipeMassG")
		) {
			continue;
		}
		if (profile === "agent" && key === "nutritionV2") {
			continue;
		}
		next[key] = projectNode(child, profile, tool, keepDetail);
	}

	if (looksLikeNutrients(next)) {
		if (next.carbsG == null && next.carbG != null) {
			next.carbsG = next.carbG;
		}
		delete next.carbG;
		for (const key of MACRO_KEYS) {
			if (key === "carbG") continue;
			const amount = next[key];
			if (typeof amount === "number") {
				next[key] = roundMacro(amount);
			}
		}
	} else {
		for (const key of MACRO_KEYS) {
			const amount = next[key];
			if (typeof amount === "number") {
				next[key] = roundMacro(amount);
			}
		}
		if ("carbG" in next) delete next.carbG;
	}

	if ("tags" in next) {
		next.tags = projectTags(next.tags, profile);
	}

	if (profile === "agent") {
		if (
			isRecord(next.customFields) &&
			Object.keys(next.customFields).length === 0
		) {
			delete next.customFields;
		}
		if (Array.isArray(next.equipment) && next.equipment.length === 0) {
			delete next.equipment;
		}
		if (Array.isArray(next.ingredients) && next.ingredients.length === 0) {
			delete next.ingredients;
		}
		if (
			(tool === "get_supply_list" || tool === "get_kitchen_summary") &&
			"sourceMeals" in next
		) {
			delete next.sourceMeals;
		}
	}

	return next;
}

export type MealIndexSource = {
	id: string;
	name: string;
	domain?: string | null;
	type?: string | null;
	servings?: number | null;
	tags?: unknown;
	nutrition?: unknown;
	nutritionStatus?: string | null;
	ingredients?: unknown;
};

/** Galley index row: no directions, attributions, or empty ingredient arrays. */
export function toAgentMealIndexItem(
	meal: MealIndexSource,
	options?: { includeIngredients?: boolean },
): Record<string, unknown> {
	const nutrition = compactMealNutrition(meal.nutrition);
	const tags = mealTagSlugs(meal.tags);
	const row: Record<string, unknown> = {
		id: meal.id,
		name: meal.name,
		type: meal.type ?? "recipe",
		servings: meal.servings ?? 1,
		domain: meal.domain ?? "food",
		tags,
		...(meal.nutritionStatus ? { nutritionStatus: meal.nutritionStatus } : {}),
		...(nutrition ? { nutrition } : {}),
	};
	if (options?.includeIngredients && Array.isArray(meal.ingredients)) {
		if (meal.ingredients.length > 0) {
			row.ingredients = meal.ingredients;
		}
	}
	return row;
}

export function mealTagSlugs(tags: unknown): string[] {
	if (!Array.isArray(tags)) return [];
	return tags.flatMap((tag) => {
		if (typeof tag === "string") return [tag];
		if (isRecord(tag) && typeof tag.slug === "string") return [tag.slug];
		return [];
	});
}

export function compactMealNutrition(raw: unknown): {
	perServing: Record<string, number | null>;
	coverage: number | null;
} | null {
	if (!isRecord(raw)) return null;
	const per = isRecord(raw.perServing) ? raw.perServing : null;
	if (!per) return null;
	const pick = (key: "energyKcal" | "proteinG" | "fatG" | "fiberG") => {
		const value = per[key];
		return typeof value === "number" && Number.isFinite(value)
			? roundMacro(value)
			: null;
	};
	const carbs = per.carbsG ?? per.carbG;
	return {
		perServing: {
			energyKcal: pick("energyKcal"),
			proteinG: pick("proteinG"),
			carbsG:
				typeof carbs === "number" && Number.isFinite(carbs)
					? roundMacro(carbs)
					: null,
			fatG: pick("fatG"),
			fiberG: pick("fiberG"),
		},
		coverage:
			typeof raw.coverage === "number" && Number.isFinite(raw.coverage)
				? roundMacro(raw.coverage)
				: null,
	};
}

export function projectToolResult(input: {
	tool: string;
	profile: ResponseProfile;
	data: unknown;
	meta?: ToolMeta;
	args?: Record<string, unknown>;
	warnings?: string[];
}): { data: unknown; meta?: ToolMeta; warnings?: string[] } {
	const keepDetail =
		input.profile === "card" ||
		input.tool === "get_meal" ||
		input.args?.detail === "full";
	const includeSourceMeals = input.args?.includeSourceMeals === true;
	let data = projectNode(input.data, input.profile, input.tool, keepDetail);

	const meta: ToolMeta = { ...(input.meta ?? {}) };
	if (
		input.profile === "agent" &&
		(input.tool === "get_nutrition_summary" ||
			input.tool === "get_kitchen_summary" ||
			input.tool === "list_nutrition_intakes")
	) {
		meta.schemaVersion = 2;
	}

	if (
		input.profile === "agent" &&
		input.tool === "get_context" &&
		isRecord(data)
	) {
		const apiKeyId = data.apiKeyId;
		delete data.apiKeyId;
		delete data.organizationId;
		delete data.keyPrefix;
		delete data.credentialId;
		if (typeof data.keyName === "string") {
			if (isOpaqueKeyName(data.keyName, apiKeyId)) {
				delete data.keyName;
			}
		} else {
			delete data.keyName;
		}
	}

	if (
		input.profile === "agent" &&
		input.tool === "get_cargo_item" &&
		isRecord(data)
	) {
		delete data.organizationId;
		delete data.credentialId;
	}

	if (
		input.profile === "agent" &&
		(input.tool === "get_supply_list" ||
			input.tool === "get_kitchen_summary") &&
		!includeSourceMeals
	) {
		data = stripKey(data, "sourceMeals");
	}

	if (
		input.profile === "agent" &&
		input.tool === "list_meals" &&
		input.args?.includeIngredients !== true
	) {
		meta.ingredients = "omitted";
	}

	return {
		data,
		meta,
		warnings: input.warnings,
	};
}

function stripKey(value: unknown, key: string): unknown {
	if (Array.isArray(value)) return value.map((item) => stripKey(item, key));
	if (!isRecord(value)) return value;
	const next: Record<string, unknown> = {};
	for (const [childKey, child] of Object.entries(value)) {
		if (childKey === key) continue;
		next[childKey] = stripKey(child, key);
	}
	return next;
}
