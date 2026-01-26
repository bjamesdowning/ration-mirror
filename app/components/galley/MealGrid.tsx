import { useEffect, useState } from "react";
import type { meal } from "~/db/schema";
import type { MealMatchResult } from "~/lib/matching.server";
import { MealCard } from "./MealCard";
import { MealMatchBadge } from "./MealMatchBadge";

interface MealGridProps {
	meals: (typeof meal.$inferSelect & {
		tags?: string[];
		ingredients?: { quantity: number; unit: string }[];
	})[];
	enableMatching?: boolean;
}

export function MealGrid({ meals, enableMatching = false }: MealGridProps) {
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
				console.error("Match fetch error:", err);
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setIsLoading(false);
			}
		};

		fetchMatches();
	}, [matchMode, minMatch, enableMatching]);

	if (meals.length === 0) {
		return (
			<div className="p-8 border border-dashed border-[#39FF14]/30 text-center text-[#39FF14]/50 font-mono uppercase">
				<p>NO MEAL DATA FOUND</p>
				<p className="text-sm mt-2">INITIATE CREATION SEQUENCE</p>
			</div>
		);
	}

	// Render matching controls if enabled
	if (enableMatching) {
		return (
			<div className="space-y-6">
				{/* Matching Controls */}
				<div className="border border-[#39FF14]/30 bg-[#051105]/50 p-4 font-mono">
					<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
						{/* Mode Toggle */}
						<div className="flex items-center gap-4">
							<span className="text-xs text-[#39FF14]/70 uppercase tracking-wider">
								Match Mode:
							</span>
							<div className="flex border border-[#39FF14]/50">
								<button
									type="button"
									onClick={() => setMatchMode("strict")}
									className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
										matchMode === "strict"
											? "bg-[#39FF14] text-black font-bold"
											: "text-[#39FF14] hover:bg-[#39FF14]/10"
									}`}
								>
									Strict
								</button>
								<button
									type="button"
									onClick={() => setMatchMode("delta")}
									className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
										matchMode === "delta"
											? "bg-[#39FF14] text-black font-bold"
											: "text-[#39FF14] hover:bg-[#39FF14]/10"
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
									className="text-xs text-[#39FF14]/70 uppercase tracking-wider"
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
									className="w-32 h-1 bg-[#39FF14]/20 accent-[#39FF14]"
								/>
								<span className="text-sm font-bold text-[#39FF14] w-12">
									{minMatch}%
								</span>
							</div>
						)}
					</div>
				</div>

				{/* Loading State */}
				{isLoading && (
					<div className="p-8 border border-[#39FF14]/30 text-center text-[#39FF14]/70 font-mono uppercase">
						<p className="animate-pulse">Processing Match Query...</p>
					</div>
				)}

				{/* Error State */}
				{error && (
					<div className="p-4 border border-red-500/50 bg-red-500/10 text-red-500 font-mono text-xs">
						<p className="uppercase">Match Error: {error}</p>
					</div>
				)}

				{/* Match Results Grid */}
				{!isLoading && matchResults && (
					<>
						<div className="text-xs text-[#39FF14]/70 uppercase tracking-wider font-mono">
							Found {matchResults.length} matching meal protocols
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{matchResults.map((result) => (
								<div key={result.meal.id} className="relative">
									<MealCard meal={result.meal} />
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
					<div className="p-8 border border-dashed border-[#39FF14]/30 text-center text-[#39FF14]/50 font-mono uppercase">
						<p>No meals match current criteria</p>
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
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{meals.map((meal) => (
				<MealCard key={meal.id} meal={meal} />
			))}
		</div>
	);
}
