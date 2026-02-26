import { Suspense } from "react";
import { Await } from "react-router";
import { MealSuggestionsCard } from "~/components/hub/MealSuggestionsCard";
import { MealWidgetSkeleton } from "~/components/hub/MealWidgetSkeleton";
import type { MealMatchResult } from "~/lib/matching.server";
import type { HubWidgetProps } from "~/lib/types";

function isPromise<T>(v: T | Promise<T>): v is Promise<T> {
	return v != null && typeof (v as Promise<T>).then === "function";
}

export function MealsReadyWidget({ data }: HubWidgetProps) {
	const mealMatches = data.mealMatches;

	if (isPromise(mealMatches)) {
		return (
			<Suspense fallback={<MealWidgetSkeleton />}>
				<Await resolve={mealMatches}>
					{(resolved) => {
						const readyMeals = (resolved ?? []).filter(
							(m) => m.canMake,
						) as unknown as MealMatchResult[];
						return <MealSuggestionsCard meals={readyMeals} />;
					}}
				</Await>
			</Suspense>
		);
	}

	const readyMeals = mealMatches.filter(
		(m) => m.canMake,
	) as unknown as MealMatchResult[];
	return <MealSuggestionsCard meals={readyMeals} />;
}
