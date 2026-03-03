import {
	AlertCircle,
	Check,
	ChefHat,
	ChevronDown,
	ChevronUp,
	ClipboardList,
	Sparkles,
	Timer,
} from "lucide-react";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useFetcher, useNavigate } from "react-router";
import {
	AIFeatureIntroView,
	AIFeatureModal,
} from "~/components/ai/AIFeatureModal";
import { MAX_POLL_ATTEMPTS, POLL_INTERVAL_MS } from "~/lib/polling";

interface GeneratedRecipe {
	name: string;
	description: string;
	ingredients: Array<{
		ingredientName: string;
		quantity: number;
		unit: string;
		inventoryName: string;
	}>;
	directions: Array<string>;
	prepTime: number;
	cookTime: number;
	missingIngredients?: string[];
}

export interface GenerateMealButtonHandle {
	open: () => void;
}

interface GenerateMealButtonProps {
	className?: string;
	/** Current group credit balance (from hub loader); shown in modal when provided */
	credits?: number;
	/** Credit cost per generation (from hub loader aiCosts.MEAL_GENERATE) */
	costPerGenerate?: number;
}

const MAX_CUSTOMIZATION = 200;

function RecipeCard({
	recipe,
	idx,
	selected,
	onToggle,
	readOnly = false,
}: {
	recipe: GeneratedRecipe;
	idx: number;
	selected: boolean;
	onToggle: (idx: number) => void;
	readOnly?: boolean;
}) {
	const [directionsOpen, setDirectionsOpen] = useState(false);

	return (
		<div className="flex flex-col bg-white dark:bg-white/5 border border-carbon/5 dark:border-white/10 rounded-xl overflow-hidden hover:shadow-lg transition-shadow group">
			<div className="p-5 flex-1 flex flex-col gap-4">
				{/* Header row */}
				<div className="flex items-start gap-3">
					{!readOnly && (
						<input
							type="checkbox"
							id={`recipe-select-${idx}`}
							checked={selected}
							onChange={() => onToggle(idx)}
							className="mt-1 w-4 h-4 rounded border-platinum text-hyper-green focus:ring-hyper-green"
							aria-label={`Select ${recipe.name}`}
						/>
					)}
					<div className="flex-1 min-w-0">
						<h4 className="font-bold text-lg text-carbon dark:text-white group-hover:text-hyper-green transition-colors leading-snug">
							{recipe.name}
						</h4>
						<p className="text-sm text-muted line-clamp-3 mt-1">
							{recipe.description}
						</p>
					</div>
				</div>

				{/* Meta row */}
				<div className="flex gap-4 text-xs text-carbon/60 dark:text-white/60">
					<div className="flex items-center gap-1">
						<Timer className="w-3 h-3" />
						{recipe.prepTime + recipe.cookTime}m total
					</div>
					<div className="flex items-center gap-1">
						<Timer className="w-3 h-3 opacity-0" />
						Prep {recipe.prepTime}m · Cook {recipe.cookTime}m
					</div>
					<div className="flex items-center gap-1 ml-auto">
						<ChefHat className="w-3 h-3" />
						{recipe.ingredients.length} ingr.
					</div>
				</div>

				{/* Missing ingredients warning */}
				{recipe.missingIngredients && recipe.missingIngredients.length > 0 && (
					<div className="p-2 bg-yellow-50 border border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/30 rounded text-xs text-yellow-800 dark:text-yellow-300">
						<strong>Missing:</strong> {recipe.missingIngredients.join(", ")}
					</div>
				)}

				{/* Ingredients list */}
				<div className="space-y-1">
					<h5 className="text-xs font-bold text-carbon dark:text-white uppercase tracking-wider mb-2">
						Ingredients
					</h5>
					{recipe.ingredients.slice(0, 5).map((ing) => (
						<div
							key={ing.ingredientName}
							className="flex justify-between text-xs text-muted"
						>
							<span>{ing.ingredientName}</span>
							<span className="font-medium tabular-nums">
								{ing.quantity} {ing.unit}
							</span>
						</div>
					))}
					{recipe.ingredients.length > 5 && (
						<div className="text-xs text-muted italic pt-1">
							+ {recipe.ingredients.length - 5} more
						</div>
					)}
				</div>

				{/* Directions accordion */}
				{recipe.directions && recipe.directions.length > 0 && (
					<div className="border-t border-platinum dark:border-white/10 pt-3 mt-1">
						<button
							type="button"
							onClick={() => setDirectionsOpen((o) => !o)}
							className="flex items-center justify-between w-full text-left group/dir"
							aria-expanded={directionsOpen}
						>
							<span className="flex items-center gap-1.5 text-xs font-bold text-carbon dark:text-white uppercase tracking-wider group-hover/dir:text-hyper-green transition-colors">
								<ClipboardList className="w-3.5 h-3.5" />
								Directions ({recipe.directions.length} steps)
							</span>
							{directionsOpen ? (
								<ChevronUp className="w-3.5 h-3.5 text-muted" />
							) : (
								<ChevronDown className="w-3.5 h-3.5 text-muted" />
							)}
						</button>
						{directionsOpen && (
							<ol className="mt-3 space-y-2 list-none">
								{recipe.directions.map((step, i) => (
									<li
										key={step}
										className="flex gap-2.5 text-xs text-carbon/80 dark:text-white/80 leading-relaxed"
									>
										<span className="flex-shrink-0 w-5 h-5 rounded-full bg-hyper-green/15 text-hyper-green font-bold flex items-center justify-center text-[10px]">
											{i + 1}
										</span>
										<span>{step}</span>
									</li>
								))}
							</ol>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function RecipeResultsGrid({
	recipes,
	selectedRecipes,
	onToggle,
	readOnly = false,
}: {
	recipes: GeneratedRecipe[];
	selectedRecipes: Set<number>;
	onToggle: (idx: number) => void;
	readOnly?: boolean;
}) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
			{recipes.map((recipe, idx) => (
				<RecipeCard
					key={`${recipe.name}-${idx}`}
					recipe={recipe}
					idx={idx}
					selected={selectedRecipes.has(idx)}
					onToggle={onToggle}
					readOnly={readOnly}
				/>
			))}
		</div>
	);
}

export const GenerateMealButton = forwardRef<
	GenerateMealButtonHandle,
	GenerateMealButtonProps
>(({ className, credits, costPerGenerate = 2 }, ref) => {
	const [showModal, setShowModal] = useState(false);
	const [view, setView] = useState<"intro" | "form">("intro");
	const [customization, setCustomization] = useState("");
	const [selectedRecipes, setSelectedRecipes] = useState<Set<number>>(
		new Set(),
	);
	const batchSaveInFlight = useRef(false);
	const generateFetcher = useFetcher<
		| { recipes: GeneratedRecipe[]; error?: string }
		| { status: "queued"; requestId: string }
	>();
	const saveFetcher = useFetcher();
	const navigate = useNavigate();
	const [pollRequestId, setPollRequestId] = useState<string | null>(null);
	const [recipes, setRecipes] = useState<GeneratedRecipe[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	/** True when recipes came from queue consumer (meals already in galley) */
	const [mealsAlreadySaved, setMealsAlreadySaved] = useState(false);

	// Expose open method via ref
	useImperativeHandle(ref, () => ({
		open: () => {
			setShowModal(true);
			setView("intro");
		},
	}));

	const isGenerating =
		generateFetcher.state === "submitting" ||
		generateFetcher.state === "loading" ||
		pollRequestId !== null;

	// Handle initial POST response: queued -> start poll; error -> set error; direct recipes (legacy) -> set recipes
	useEffect(() => {
		if (generateFetcher.state !== "idle" || !generateFetcher.data) return;
		const d = generateFetcher.data as
			| {
					status?: string;
					requestId?: string;
					recipes?: GeneratedRecipe[];
					error?: string;
			  }
			| undefined;
		if (!d) return;
		if (d.status === "queued" && typeof d.requestId === "string") {
			setPollRequestId(d.requestId);
			setError(null);
			setMealsAlreadySaved(false);
		} else if (d.error) {
			setError(d.error);
			setRecipes(null);
			setMealsAlreadySaved(false);
		}
	}, [generateFetcher.state, generateFetcher.data]);

	// Poll meal generation status when requestId is set
	useEffect(() => {
		if (!pollRequestId) return;

		let attempts = 0;
		const poll = async () => {
			attempts++;
			if (attempts > MAX_POLL_ATTEMPTS) {
				setError("Generation timed out. Please try again.");
				setPollRequestId(null);
				return;
			}
			try {
				const res = await fetch(`/api/meals/generate/status/${pollRequestId}`, {
					credentials: "include",
				});
				if (res.status === 404) {
					setError("Job not found or expired. Please try again.");
					setPollRequestId(null);
					return;
				}
				const data = (await res.json()) as {
					status: "pending" | "completed" | "failed";
					mealIds?: string[];
					recipes?: Array<{
						name: string;
						description: string;
						ingredients: Array<{
							name: string;
							quantity: number;
							unit: string;
							inventoryName: string;
						}>;
						directions: string[];
						prepTime: number;
						cookTime: number;
					}>;
					error?: string;
				};
				if (data.status === "pending") {
					return; // Keep polling
				}
				if (data.status === "completed" && data.recipes) {
					const mapped: GeneratedRecipe[] = data.recipes.map((r) => ({
						...r,
						ingredients: r.ingredients.map((i) => ({
							ingredientName: i.name,
							quantity: i.quantity,
							unit: i.unit,
							inventoryName: i.inventoryName,
						})),
					}));
					setRecipes(mapped);
					// Default to all selected; user can deselect before saving
					setSelectedRecipes(new Set(mapped.map((_, i) => i)));
					setError(null);
					setPollRequestId(null);
					setMealsAlreadySaved(false);
				} else if (data.status === "failed") {
					setError(data.error ?? "Generation failed. Please try again.");
					setPollRequestId(null);
				}
			} catch {
				// Network error, keep polling
			}
		};

		const id = setInterval(poll, POLL_INTERVAL_MS);
		poll();
		return () => clearInterval(id);
	}, [pollRequestId]);

	const handleGenerate = () => {
		setRecipes(null);
		setError(null);
		setPollRequestId(null);
		setMealsAlreadySaved(false);
		const payload: Record<string, string> = {};
		const trimmed = customization.trim();
		if (trimmed) payload.customization = trimmed;
		generateFetcher.submit(payload, {
			method: "post",
			action: "/api/meals/generate",
		});
	};

	const handleBatchSave = () => {
		if (!recipes || selectedRecipes.size === 0) return;
		batchSaveInFlight.current = true;
		const toSave = Array.from(selectedRecipes)
			.sort((a, b) => a - b)
			.map((idx) => recipes[idx])
			.filter(Boolean);
		const mealDataArray = toSave.map((recipe) => ({
			name: recipe.name,
			description: recipe.description,
			directions: recipe.directions,
			prepTime: recipe.prepTime,
			cookTime: recipe.cookTime,
			ingredients: recipe.ingredients,
			tags: ["ai-generated"],
		}));

		saveFetcher.submit(JSON.stringify(mealDataArray), {
			method: "post",
			action: "/hub/galley/new",
			encType: "application/json",
		});
	};

	const toggleRecipe = (idx: number) => {
		setSelectedRecipes((prev) => {
			const next = new Set(prev);
			if (next.has(idx)) next.delete(idx);
			else next.add(idx);
			return next;
		});
	};

	const selectAll = () => {
		if (!recipes) return;
		if (selectedRecipes.size === recipes.length) {
			setSelectedRecipes(new Set());
		} else {
			setSelectedRecipes(new Set(recipes.map((_, i) => i)));
		}
	};

	useEffect(() => {
		if (saveFetcher.state === "idle" && batchSaveInFlight.current) {
			batchSaveInFlight.current = false;
			const hasError =
				saveFetcher.data &&
				typeof saveFetcher.data === "object" &&
				"error" in saveFetcher.data;
			if (!hasError) {
				setShowModal(false);
				setView("intro");
				setSelectedRecipes(new Set());
				navigate("/hub/galley");
			}
		}
	}, [saveFetcher.state, saveFetcher.data, navigate]);

	const handleClose = () => {
		setShowModal(false);
		setView("intro");
		setRecipes(null);
		setError(null);
		setPollRequestId(null);
		setMealsAlreadySaved(false);
	};

	return (
		<>
			<button
				type="button"
				onClick={() => setShowModal(true)}
				className={`
					flex items-center gap-2 px-4 py-3 
					bg-hyper-green text-carbon font-semibold rounded-lg
					shadow-glow-sm hover:shadow-glow transition-all
					active:scale-95
					${className || ""}
				`}
			>
				<Sparkles className="w-4 h-4" />
				Generate Meal
			</button>

			{showModal && (
				<AIFeatureModal
					open={showModal}
					onClose={handleClose}
					title="AI Meal Assistant"
					subtitle="Powered by Orbital Intelligence"
					icon={<Sparkles className="w-5 h-5 text-hyper-green" />}
					maxWidth="lg"
				>
					{view === "intro" ? (
						<AIFeatureIntroView
							description="AI uses your current Cargo to suggest 3 recipes you can make with what you have—no guessing what's in stock."
							cost={costPerGenerate}
							costLabel="per generation"
							credits={typeof credits === "number" ? credits : 0}
							onCancel={handleClose}
							onConfirm={() => setView("form")}
							confirmLabel="Continue"
						/>
					) : (
						<div className="p-8">
							{/* Form / Loading / Error / Results */}
							{!recipes && !error && (
								<div className="text-center py-12">
									{isGenerating ? (
										<div className="animate-pulse space-y-4">
											<div className="w-16 h-16 mx-auto rounded-full bg-hyper-green/20 flex items-center justify-center animate-spin-slow">
												<Sparkles className="w-8 h-8 text-hyper-green" />
											</div>
											<h4 className="text-lg font-medium text-carbon dark:text-white">
												Generating meals...
											</h4>
											<p className="text-muted text-sm">
												Inventing recipes based on your stock.
											</p>
										</div>
									) : (
										<div className="space-y-6">
											<p className="text-carbon/80 dark:text-white/80 max-w-md mx-auto">
												Optional: add dietary preference, cuisine type, or time
												constraint.
											</p>
											<div className="max-w-md mx-auto text-left">
												<label
													htmlFor="meal-customization"
													className="block text-sm font-medium text-carbon dark:text-white mb-1"
												>
													Customize results{" "}
													<span className="font-normal text-muted">
														(optional)
													</span>
												</label>
												<p className="text-xs text-muted mb-2">
													Dietary preference, cuisine type, or time constraint —
													e.g. vegan, Mexican, under 30 min
												</p>
												<input
													id="meal-customization"
													type="text"
													value={customization}
													onChange={(e) =>
														setCustomization(
															e.target.value.slice(0, MAX_CUSTOMIZATION),
														)
													}
													placeholder="e.g. vegan, Mexican, under 30 min"
													className="w-full px-4 py-3 rounded-lg border border-platinum dark:border-white/20 bg-white dark:bg-white/5 text-carbon dark:text-white placeholder:text-muted mb-2"
													maxLength={MAX_CUSTOMIZATION}
													aria-describedby="meal-customization-hint"
												/>
												<p
													id="meal-customization-hint"
													className="text-xs text-muted text-right"
												>
													{customization.length}/{MAX_CUSTOMIZATION}
												</p>
											</div>
											<button
												type="button"
												onClick={handleGenerate}
												className="px-8 py-4 bg-hyper-green text-carbon font-bold rounded-xl shadow-glow hover:scale-105 transition-all"
											>
												Generate Ideas
											</button>
										</div>
									)}
								</div>
							)}

							{/* Error State */}
							{error && (
								<div className="flex flex-col items-center justify-center py-12 text-center text-red-500">
									<AlertCircle className="w-12 h-12 mb-4" />
									<h4 className="text-lg font-bold">Generation Failed</h4>
									<p className="text-sm opacity-80 mb-6">{error}</p>
									<button
										type="button"
										onClick={handleGenerate}
										className="px-6 py-2 bg-platinum text-carbon dark:bg-white/10 dark:text-white rounded-lg hover:bg-platinum/80 dark:hover:bg-white/20"
									>
										Try Again
									</button>
								</div>
							)}

							{/* Results Grid */}
							{recipes && (
								<div className="space-y-6">
									<RecipeResultsGrid
										recipes={recipes}
										selectedRecipes={selectedRecipes}
										onToggle={toggleRecipe}
										readOnly={mealsAlreadySaved}
									/>

									{/* Footer: View in Galley (queue) or Save Selected (legacy) */}
									<div className="sticky bottom-0 p-4 bg-ceramic/95 dark:bg-[#1A1A1A]/95 border-t border-platinum dark:border-white/10 rounded-b-2xl flex flex-col gap-3">
										{saveFetcher.data &&
											typeof saveFetcher.data === "object" &&
											"error" in saveFetcher.data &&
											!mealsAlreadySaved && (
												<div
													className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm"
													role="alert"
												>
													<AlertCircle className="w-4 h-4 shrink-0" />
													<span>
														{(saveFetcher.data as { error?: string }).error ??
															"Save failed"}
													</span>
												</div>
											)}
										<div className="flex flex-wrap items-center justify-between gap-4">
											{mealsAlreadySaved ? (
												<p className="text-sm text-muted">
													Recipes added to your Galley.
												</p>
											) : (
												<button
													type="button"
													onClick={selectAll}
													className="text-sm text-muted hover:text-hyper-green transition-colors"
												>
													{selectedRecipes.size === recipes.length
														? "Deselect All"
														: "Select All"}
												</button>
											)}
											{mealsAlreadySaved ? (
												<button
													type="button"
													onClick={() => {
														setShowModal(false);
														setView("intro");
														setRecipes(null);
														setError(null);
														navigate("/hub/galley");
													}}
													className="flex items-center gap-2 px-6 py-3 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
												>
													<Check className="w-4 h-4" />
													View in Galley
												</button>
											) : (
												<button
													type="button"
													onClick={handleBatchSave}
													disabled={
														saveFetcher.state !== "idle" ||
														selectedRecipes.size === 0
													}
													className="flex items-center gap-2 px-6 py-3 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow disabled:opacity-50 transition-all"
												>
													{saveFetcher.state !== "idle" ? (
														<span className="w-4 h-4 border-2 border-carbon/30 border-t-carbon rounded-full animate-spin" />
													) : (
														<>
															<Check className="w-4 h-4" />
															Save Selected ({selectedRecipes.size})
														</>
													)}
												</button>
											)}
										</div>
									</div>
								</div>
							)}
						</div>
					)}
				</AIFeatureModal>
			)}
		</>
	);
});

GenerateMealButton.displayName = "GenerateMealButton";
