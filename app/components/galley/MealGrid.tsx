import { useEffect, useRef, useState } from "react";
import type { meal } from "~/db/schema";
import type { AllergenSlug } from "~/lib/allergens";
import { log } from "~/lib/logging.client";
import type { MealMatchResult } from "~/lib/matching.server";
import type { MealCustomFields } from "~/lib/types";
import { MealCard } from "./MealCard";
import { MealListRow } from "./MealListRow";
import { MealMatchBadge } from "./MealMatchBadge";
import { ProvisionCard } from "./ProvisionCard";

type ViewMode = "card" | "list";

interface MealGridProps {
	meals: (typeof meal.$inferSelect & {
		type?: string;
		tags?: string[];
		ingredients?: {
			inventoryId?: string | null;
			ingredientName: string;
			quantity: number;
			unit: string;
			isOptional?: boolean | null;
			orderIndex?: number | null;
		}[];
		equipment?: string[] | null;
		customFields?: string | MealCustomFields | null;
	})[];
	enableMatching?: boolean;
	inventory?: {
		id: string;
		name: string;
		unit: string;
		quantity: number;
	}[];
	activeMealIds?: Set<string>;
	onToggleMealActive?: (mealId: string, nextActive: boolean) => void;
	viewMode?: ViewMode;
	/** User's declared allergen slugs — propagated to MealCard for warning badges. */
	userAllergens?: AllergenSlug[];
	getDetailHref?: (meal: { id: string }) => string;
}

export function MealGrid({
	meals,
	enableMatching = false,
	inventory = [],
	activeMealIds,
	onToggleMealActive,
	viewMode = "card",
	userAllergens = [],
	getDetailHref,
}: MealGridProps) {
	const [matchMode, setMatchMode] = useState<"strict" | "delta">("delta");
	const [minMatch, setMinMatch] = useState(50);
	const [matchResults, setMatchResults] = useState<MealMatchResult[] | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	// Fetch match results when mode or minMatch changes (debounced, cancellable)
	useEffect(() => {
		if (!enableMatching) return;

		debounceRef.current = setTimeout(() => {
			debounceRef.current = null;
			abortRef.current?.abort();
			abortRef.current = new AbortController();
			const signal = abortRef.current.signal;

			const fetchMatches = async () => {
				setIsLoading(true);
				setError(null);

				try {
					const params = new URLSearchParams({
						mode: matchMode,
						minMatch: minMatch.toString(),
						limit: "50",
					});

					const response = await fetch(`/api/meals/match?${params}`, {
						signal,
					});
					const data = (await response.json()) as {
						results: MealMatchResult[];
						error?: string;
						cached?: boolean;
					};

					if (!response.ok) {
						throw new Error(data.error || "Failed to fetch matches");
					}

					setMatchResults(data.results);
				} catch (err) {
					if (err instanceof Error && err.name === "AbortError") return;
					log.error("Match fetch error", err);
					setError(err instanceof Error ? err.message : "Unknown error");
				} finally {
					if (!signal.aborted) setIsLoading(false);
				}
			};

			fetchMatches();
		}, 200);

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
			abortRef.current?.abort();
		};
	}, [matchMode, minMatch, enableMatching]);

	if (meals.length === 0) {
		return (
			<div className="bg-platinum/50 rounded-xl p-8 text-center text-muted">
				<p className="font-medium text-carbon">No meals found</p>
				<p className="text-sm mt-2">Create your first meal to get started</p>
			</div>
		);
	}

	// Render matching controls if enabled
	if (enableMatching) {
		return (
			<div className="space-y-6">
				{/* Matching Controls */}
				<div className="glass-panel rounded-xl p-4">
					<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
						{/* Mode Toggle */}
						<div className="flex items-center gap-4">
							<span className="text-label text-muted text-sm">Match Mode:</span>
							<div className="flex rounded-lg overflow-hidden border border-platinum">
								<button
									type="button"
									onClick={() => setMatchMode("strict")}
									className={`px-4 py-2 text-sm font-medium transition-colors ${
										matchMode === "strict"
											? "bg-hyper-green text-carbon"
											: "text-muted hover:bg-platinum/50"
									}`}
								>
									Strict
								</button>
								<button
									type="button"
									onClick={() => setMatchMode("delta")}
									className={`px-4 py-2 text-sm font-medium transition-colors ${
										matchMode === "delta"
											? "bg-hyper-green text-carbon"
											: "text-muted hover:bg-platinum/50"
									}`}
								>
									Delta
								</button>
							</div>
						</div>

						{/* Minimum Match Slider (Delta mode only) */}
						{matchMode === "delta" && (
							<div className="flex items-center gap-4">
								<label
									htmlFor="minMatch"
									className="text-label text-muted text-sm"
								>
									Min Match:
								</label>
								<input
									type="range"
									id="minMatch"
									min="0"
									max="100"
									step="5"
									value={minMatch}
									onChange={(e) => setMinMatch(Number(e.target.value))}
									className="w-32 h-2 bg-platinum rounded-full accent-hyper-green"
								/>
								<span className="text-data text-sm font-bold text-hyper-green w-12">
									{minMatch}%
								</span>
							</div>
						)}
					</div>
				</div>

				{/* Error State */}
				{error && (
					<div className="bg-danger/10 rounded-xl p-4 text-danger text-sm">
						<p>Match Error: {error}</p>
					</div>
				)}

				{/* Initial loading state when no results yet */}
				{isLoading && !matchResults && (
					<div className="bg-platinum/50 rounded-xl p-8 text-center text-muted">
						<p className="animate-pulse">Processing match query...</p>
					</div>
				)}

				{/* Match Results — preserve previous results while loading, show overlay */}
				{matchResults && (
					<div
						className={
							isLoading ? "relative opacity-75 pointer-events-none" : ""
						}
					>
						{isLoading && (
							<div className="absolute inset-0 flex items-center justify-center z-10 bg-ceramic/60 rounded-xl">
								<span className="text-sm text-muted animate-pulse">
									Updating matches...
								</span>
							</div>
						)}
						<div className="text-sm text-muted">
							Found {matchResults.length} matching meals
						</div>
						{viewMode === "list" ? (
							<div className="bg-platinum/30 rounded-2xl px-4 py-2 pb-36 md:pb-2 divide-y divide-platinum/50">
								{matchResults.map((result) => (
									<div key={result.meal.id} className="relative">
										<MealListRow
											meal={result.meal}
											availableIngredients={inventory}
											isActive={activeMealIds?.has(result.meal.id)}
											onToggleActive={onToggleMealActive}
											detailHref={getDetailHref?.(result.meal)}
										/>
										<div className="absolute top-3 right-12">
											<MealMatchBadge
												percentage={result.matchPercentage}
												canMake={result.canMake}
												size="sm"
											/>
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
								{matchResults.map((result) => (
									<div key={result.meal.id} className="relative">
										{result.meal.type === "provision" ? (
											<ProvisionCard
												meal={result.meal}
												isActive={activeMealIds?.has(result.meal.id)}
												onToggleActive={onToggleMealActive}
												detailHref={getDetailHref?.(result.meal)}
											/>
										) : (
											<MealCard
												meal={result.meal}
												availableIngredients={inventory}
												isActive={activeMealIds?.has(result.meal.id)}
												onToggleActive={onToggleMealActive}
												userAllergens={userAllergens}
												detailHref={getDetailHref?.(result.meal)}
											/>
										)}
										<div className="absolute top-2 right-2">
											<MealMatchBadge
												percentage={result.matchPercentage}
												canMake={result.canMake}
												size="sm"
											/>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				)}

				{!isLoading && matchResults?.length === 0 && (
					<div className="bg-platinum/50 rounded-xl p-8 text-center text-muted">
						<p className="font-medium text-carbon">
							No meals match current criteria
						</p>
						<p className="text-sm mt-2">
							{matchMode === "strict"
								? "Try delta mode or add more inventory items"
								: "Lower the minimum match percentage"}
						</p>
					</div>
				)}
			</div>
		);
	}

	// Regular list view
	if (viewMode === "list") {
		return (
			<div className="bg-platinum/30 rounded-2xl px-4 py-2 pb-36 md:pb-2 divide-y divide-platinum/50">
				{meals.map((mealItem) => (
					<MealListRow
						key={mealItem.id}
						meal={mealItem}
						availableIngredients={inventory}
						isActive={activeMealIds?.has(mealItem.id)}
						onToggleActive={onToggleMealActive}
						detailHref={getDetailHref?.(mealItem)}
					/>
				))}
			</div>
		);
	}

	// Regular card grid
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
			{meals.map((mealItem) =>
				mealItem.type === "provision" ? (
					<ProvisionCard
						key={mealItem.id}
						meal={mealItem}
						isActive={activeMealIds?.has(mealItem.id)}
						onToggleActive={onToggleMealActive}
						detailHref={getDetailHref?.(mealItem)}
					/>
				) : (
					<MealCard
						key={mealItem.id}
						meal={mealItem}
						availableIngredients={inventory}
						isActive={activeMealIds?.has(mealItem.id)}
						onToggleActive={onToggleMealActive}
						userAllergens={userAllergens}
						detailHref={getDetailHref?.(mealItem)}
					/>
				),
			)}
		</div>
	);
}
