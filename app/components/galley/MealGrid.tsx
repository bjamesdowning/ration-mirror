import { useEffect, useState } from "react";
import type { meal } from "~/db/schema";
import { log } from "~/lib/logging.client";
import type { MealMatchResult } from "~/lib/matching.server";
import type { MealCustomFields } from "~/lib/types";
import { MealCard } from "./MealCard";
import { MealMatchBadge } from "./MealMatchBadge";
import { ProvisionCard } from "./ProvisionCard";

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
}

export function MealGrid({
	meals,
	enableMatching = false,
	inventory = [],
	activeMealIds,
	onToggleMealActive,
}: MealGridProps) {
	const [matchMode, setMatchMode] = useState<"strict" | "delta">("delta");
	const [minMatch, setMinMatch] = useState(50);
	const [matchResults, setMatchResults] = useState<MealMatchResult[] | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Fetch match results when mode or minMatch changes
	useEffect(() => {
		if (!enableMatching) return;

		const fetchMatches = async () => {
			setIsLoading(true);
			setError(null);

			try {
				const params = new URLSearchParams({
					mode: matchMode,
					minMatch: minMatch.toString(),
					limit: "50",
				});

				const response = await fetch(`/api/meals/match?${params}`);
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
				log.error("Match fetch error", err);
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setIsLoading(false);
			}
		};

		fetchMatches();
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

				{/* Loading State */}
				{isLoading && (
					<div className="bg-platinum/50 rounded-xl p-8 text-center text-muted">
						<p className="animate-pulse">Processing match query...</p>
					</div>
				)}

				{/* Error State */}
				{error && (
					<div className="bg-danger/10 rounded-xl p-4 text-danger text-sm">
						<p>Match Error: {error}</p>
					</div>
				)}

				{/* Match Results Grid */}
				{!isLoading && matchResults && (
					<>
						<div className="text-sm text-muted">
							Found {matchResults.length} matching meals
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
							{matchResults.map((result) => (
								<div key={result.meal.id} className="relative">
									{result.meal.type === "provision" ? (
										<ProvisionCard
											meal={result.meal}
											isActive={activeMealIds?.has(result.meal.id)}
											onToggleActive={onToggleMealActive}
										/>
									) : (
										<MealCard
											meal={result.meal}
											availableIngredients={inventory}
											isActive={activeMealIds?.has(result.meal.id)}
											onToggleActive={onToggleMealActive}
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
					</>
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

	// Regular grid without matching
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
			{meals.map((meal) =>
				meal.type === "provision" ? (
					<ProvisionCard
						key={meal.id}
						meal={meal}
						isActive={activeMealIds?.has(meal.id)}
						onToggleActive={onToggleMealActive}
					/>
				) : (
					<MealCard
						key={meal.id}
						meal={meal}
						availableIngredients={inventory}
						isActive={activeMealIds?.has(meal.id)}
						onToggleActive={onToggleMealActive}
					/>
				),
			)}
		</div>
	);
}
