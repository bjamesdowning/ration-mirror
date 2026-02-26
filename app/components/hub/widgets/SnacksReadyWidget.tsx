import { Suspense } from "react";
import { Await } from "react-router";
import { MealWidgetSkeleton } from "~/components/hub/MealWidgetSkeleton";
import { SnacksSuggestionsCard } from "~/components/hub/SnacksSuggestionsCard";
import type { MealMatchResult } from "~/lib/matching.server";
import type { HubWidgetProps } from "~/lib/types";

function isPromise<T>(v: T | Promise<T>): v is Promise<T> {
	return v != null && typeof (v as Promise<T>).then === "function";
}

export function SnacksReadyWidget({ data }: HubWidgetProps) {
	const snackMatches = data.snackMatches;

	if (isPromise(snackMatches)) {
		return (
			<Suspense fallback={<MealWidgetSkeleton />}>
				<Await resolve={snackMatches}>
					{(resolved) => {
						const readySnacks = (resolved ?? []).filter(
							(m) => m.canMake,
						) as unknown as MealMatchResult[];
						return <SnacksSuggestionsCard meals={readySnacks} />;
					}}
				</Await>
			</Suspense>
		);
	}

	const readySnacks = snackMatches.filter(
		(m) => m.canMake,
	) as unknown as MealMatchResult[];
	return <SnacksSuggestionsCard meals={readySnacks} />;
}
