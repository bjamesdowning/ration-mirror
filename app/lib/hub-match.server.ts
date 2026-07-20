/**
 * Hub meal-match coalesce — one scored candidate pool, then widget subsets.
 * Avoids 3× fetchOrgCargoIndex / Vectorize on cold hub opens (P1-A).
 */
import {
	MEAL_MATCH_CANDIDATE_CAP,
	type MealMatchQuery,
	type MealMatchResult,
	matchMeals,
} from "~/lib/matching.server";

export interface HubMatchWidgetFilter {
	limit: number;
	tags?: string[];
}

export interface HubMatchWidgetsInput {
	mealsReady: HubMatchWidgetFilter;
	mealsPartial: HubMatchWidgetFilter;
	snacksReady: HubMatchWidgetFilter;
}

export interface HubMatchWidgets {
	mealMatches: MealMatchResult[];
	partialMealMatches: MealMatchResult[];
	snackMatches: MealMatchResult[];
}

function mealHasAnyTag(mealTags: string[], filterTags?: string[]): boolean {
	if (!filterTags || filterTags.length === 0) return true;
	const set = new Set(mealTags.map((t) => t.toLowerCase()));
	return filterTags.some((t) => set.has(t.toLowerCase()));
}

function sliceWidget(
	scored: MealMatchResult[],
	type: "recipe" | "provision",
	filter: HubMatchWidgetFilter,
): MealMatchResult[] {
	return scored
		.filter(
			(row) =>
				row.meal.type === type && mealHasAnyTag(row.meal.tags, filter.tags),
		)
		.slice(0, Math.max(1, filter.limit));
}

/**
 * Score up to `MEAL_MATCH_CANDIDATE_CAP` meals once, then derive hub widgets.
 * Widget tag/type filters are applied in memory so all surfaces share the same
 * candidate set while keeping small display limits (typically 6).
 */
export async function getHubMealMatchWidgets(
	env: Env,
	organizationId: string,
	input: HubMatchWidgetsInput,
	baseQuery?: Pick<MealMatchQuery, "mode" | "minMatch" | "domain">,
): Promise<HubMatchWidgets> {
	const scored = await matchMeals(env, organizationId, {
		mode: baseQuery?.mode ?? "delta",
		minMatch: baseQuery?.minMatch ?? 50,
		domain: baseQuery?.domain ?? "food",
		limit: MEAL_MATCH_CANDIDATE_CAP,
		preLimit: MEAL_MATCH_CANDIDATE_CAP,
	});

	return {
		mealMatches: sliceWidget(scored, "recipe", input.mealsReady),
		partialMealMatches: sliceWidget(scored, "recipe", input.mealsPartial),
		snackMatches: sliceWidget(scored, "provision", input.snacksReady),
	};
}
