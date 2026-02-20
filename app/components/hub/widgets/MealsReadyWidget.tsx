import { MealSuggestionsCard } from "~/components/hub/MealSuggestionsCard";
import type { MealMatchResult } from "~/lib/matching.server";
import type { HubWidgetProps } from "~/lib/types";

export function MealsReadyWidget({ data }: HubWidgetProps) {
	const readyMeals = data.mealMatches.filter(
		(m) => m.canMake,
	) as unknown as MealMatchResult[];
	return <MealSuggestionsCard meals={readyMeals} />;
}
