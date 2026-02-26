import { Suspense } from "react";
import { Await } from "react-router";
import { MealSuggestionsCard } from "~/components/hub/MealSuggestionsCard";
import { MealWidgetSkeleton } from "~/components/hub/MealWidgetSkeleton";
import type { MealMatchResult } from "~/lib/matching.server";
import type { HubWidgetProps } from "~/lib/types";

function isPromise<T>(v: T | Promise<T>): v is Promise<T> {
	return v != null && typeof (v as Promise<T>).then === "function";
}

export function MealsPartialWidget({ data }: HubWidgetProps) {
	const mealMatches = data.mealMatches;

	if (isPromise(mealMatches)) {
		return (
			<Suspense fallback={<MealWidgetSkeleton />}>
				<Await resolve={mealMatches}>
					{(resolved) => {
						const partialMeals = (resolved ?? []).filter(
							(m) => !m.canMake && m.matchPercentage >= 50,
						) as unknown as MealMatchResult[];
						return <MealSuggestionsCard meals={partialMeals} />;
					}}
				</Await>
			</Suspense>
		);
	}

	const partialMeals = mealMatches.filter(
		(m) => !m.canMake && m.matchPercentage >= 50,
	) as unknown as MealMatchResult[];
	return <MealSuggestionsCard meals={partialMeals} />;
}
