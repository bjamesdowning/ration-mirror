/**
 * Deterministic link-holder / skeleton meal builder for never-empty URL imports.
 * Pure module — unit-testable without Cloudflare bindings.
 */

import type { ImportCompleteness } from "~/lib/import/import-completeness";
import type { MealInput } from "~/lib/schemas/meal";
import { MealSchema } from "~/lib/schemas/meal";

export type HolderIngredientHint = {
	name: string;
	quantity?: number;
	unit?: string;
	isOptional?: boolean;
};

export type BuildImportHolderInput = {
	sourceUrl: string;
	sourceKind: string;
	/** Best title from oEmbed / page / AI / OG. */
	title?: string | null;
	/** Extra blurb (optional); source URL is always included in description. */
	blurb?: string | null;
	ingredients?: HolderIngredientHint[];
	steps?: string[];
	importTag?: string;
};

function hostnameOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "") || "link";
	} catch {
		return "link";
	}
}

/** Prefer a human title; fall back to “Recipe from {host}”. */
export function holderMealName(
	title: string | null | undefined,
	sourceUrl: string,
): string {
	const trimmed = title?.trim();
	if (trimmed && trimmed.length > 0) {
		// Avoid using a bare URL as the meal name when title accidentally is the URL.
		if (/^https?:\/\//i.test(trimmed)) {
			return `Recipe from ${hostnameOf(sourceUrl)}`;
		}
		return trimmed.slice(0, 120);
	}
	return `Recipe from ${hostnameOf(sourceUrl)}`;
}

export function holderDescription(
	sourceUrl: string,
	blurb?: string | null,
): string {
	const note =
		blurb?.trim() ||
		"Saved source link — open to view the full recipe. Add ingredients and steps when you can.";
	return `${note}\n\n${sourceUrl}`.trim();
}

/**
 * Extract a usable &lt;title&gt; from HTML when present.
 */
export function extractHtmlDocumentTitle(html: string): string | undefined {
	const match = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
	const raw = match?.[1]?.replace(/\s+/g, " ").trim();
	if (!raw) return undefined;
	// Drop common site-suffix noise lightly
	return raw.split(/\s*[|\u2013\u2014-]\s*/)[0]?.trim() || raw;
}

/**
 * Best-effort Open Graph title from HTML.
 */
export function extractOgTitle(html: string): string | undefined {
	const match =
		html.match(
			/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,200})["'][^>]*>/i,
		) ??
		html.match(
			/<meta[^>]+content=["']([^"']{1,200})["'][^>]+property=["']og:title["'][^>]*>/i,
		);
	const raw = match?.[1]?.replace(/\s+/g, " ").trim();
	return raw || undefined;
}

export function buildImportHolderMeal(input: BuildImportHolderInput): {
	meal: MealInput;
	completeness: ImportCompleteness;
} {
	const ingredients = (input.ingredients ?? [])
		.map((ing, idx) => ({
			ingredientName: ing.name.trim().toLowerCase(),
			quantity:
				typeof ing.quantity === "number" && ing.quantity >= 0
					? ing.quantity
					: 0,
			unit: (ing.unit?.trim() || "unit").toLowerCase(),
			isOptional: ing.isOptional ?? false,
			orderIndex: idx,
			cargoId: null as string | null,
		}))
		.filter((i) => i.ingredientName.length > 0);

	const stepTexts = (input.steps ?? [])
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	const hasPartial = ingredients.length > 0 || stepTexts.length > 0;

	const directions =
		stepTexts.length > 0
			? stepTexts.map((text, i) => ({ position: i + 1, text }))
			: [
					{
						position: 1,
						text: "Open the source link for the full recipe, then edit this meal to add ingredients and steps.",
					},
				];

	const tag = input.importTag ?? "url-import";
	const raw = {
		name: holderMealName(input.title, input.sourceUrl),
		domain: "food" as const,
		description: holderDescription(input.sourceUrl, input.blurb),
		directions,
		equipment: [] as string[],
		servings: 1,
		prepTime: 0,
		cookTime: 0,
		customFields: {
			sourceUrl: input.sourceUrl,
			sourceKind: input.sourceKind,
			importCompleteness: hasPartial ? "skeleton" : "link_holder",
		},
		ingredients,
		tags: [tag, hasPartial ? "partial-import" : "link-holder"],
	};

	const meal = MealSchema.parse(raw) as MealInput;
	const completeness: ImportCompleteness = hasPartial
		? "skeleton"
		: "link_holder";
	return { meal, completeness };
}
