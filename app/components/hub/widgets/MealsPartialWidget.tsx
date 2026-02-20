import { MealSuggestionsCard } from "~/components/hub/MealSuggestionsCard";
import type { MealMatchResult } from "~/lib/matching.server";
import type { HubWidgetProps } from "~/lib/types";

export function MealsPartialWidget({ data }: HubWidgetProps) {
	const partialMeals = data.mealMatches.filter(
		(m) => !m.canMake && m.matchPercentage >= 50,
	) as unknown as MealMatchResult[];
	return <MealSuggestionsCard meals={partialMeals} />;
}
