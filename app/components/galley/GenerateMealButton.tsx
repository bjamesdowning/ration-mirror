import { AlertCircle, Check, ChefHat, Sparkles, Timer } from "lucide-react";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useFetcher, useNavigate } from "react-router";

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
}

const MAX_CUSTOMIZATION = 200;

export const GenerateMealButton = forwardRef<
	GenerateMealButtonHandle,
	GenerateMealButtonProps
>(({ className }, ref) => {
	const [showModal, setShowModal] = useState(false);
	const [customization, setCustomization] = useState("");
	const [selectedRecipes, setSelectedRecipes] = useState<Set<number>>(
		new Set(),
	);
	const batchSaveInFlight = useRef(false);
	const generateFetcher = useFetcher<{
		recipes: GeneratedRecipe[];
		error?: string;
	}>();
	const saveFetcher = useFetcher();
	const navigate = useNavigate();

	// Expose open method via ref
	useImperativeHandle(ref, () => ({
		open: () => {
			setShowModal(true);
		},
	}));

	const isGenerating =
		generateFetcher.state === "submitting" ||
		generateFetcher.state === "loading";
	const recipes = generateFetcher.data?.recipes;
	const error = generateFetcher.data?.error;

	const handleGenerate = () => {
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
			directions: recipe.directions.join("\n"),
			prepTime: recipe.prepTime,
			cookTime: recipe.cookTime,
			ingredients: recipe.ingredients,
			tags: ["ai-generated"],
		}));

		saveFetcher.submit(JSON.stringify(mealDataArray), {
			method: "post",
			action: "/dashboard/meals/new",
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
				setSelectedRecipes(new Set());
				navigate("/dashboard/meals");
			}
		}
	}, [saveFetcher.state, saveFetcher.data, navigate]);

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
				<div
					className="fixed inset-0 z-[60] flex items-center justify-center bg-carbon/80 backdrop-blur-sm animate-fade-in"
					role="dialog"
					aria-modal="true"
				>
					{/* Backdrop */}
					<button
						type="button"
						className="absolute inset-0 bg-transparent cursor-default"
						onClick={() => setShowModal(false)}
						aria-label="Close modal"
					/>

					<div className="bg-ceramic dark:bg-[#1A1A1A] border border-platinum dark:border-white/10 rounded-2xl w-full md:max-w-4xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto m-4 relative z-10 flex flex-col shadow-xl">
						{/* Header */}
						<div className="p-6 border-b border-platinum dark:border-white/10 flex justify-between items-center sticky top-0 bg-ceramic/95 dark:bg-[#1A1A1A]/95 backdrop-blur z-20">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-full bg-hyper-green/20 flex items-center justify-center">
									<Sparkles className="w-5 h-5 text-hyper-green" />
								</div>
								<div>
									<h3 className="text-xl font-bold text-carbon dark:text-white">
										AI Meal Assistant
									</h3>
									<p className="text-xs text-muted">
										Powered by Orbital Intelligence
									</p>
								</div>
							</div>
							<button
								type="button"
								onClick={() => setShowModal(false)}
								className="p-2 text-carbon dark:text-white hover:bg-platinum dark:hover:bg-white/10 rounded-full transition-colors"
							>
								✕
							</button>
						</div>

						<div className="p-8">
							{/* Initial State / Loading */}
							{!recipes && !error && (
								<div className="text-center py-12">
									{isGenerating ? (
										<div className="animate-pulse space-y-4">
											<div className="w-16 h-16 mx-auto rounded-full bg-hyper-green/20 flex items-center justify-center animate-spin-slow">
												<Sparkles className="w-8 h-8 text-hyper-green" />
											</div>
											<h4 className="text-lg font-medium text-carbon dark:text-white">
												Scanning Cargo...
											</h4>
											<p className="text-muted text-sm">
												Inventing recipes based on your stock.
											</p>
										</div>
									) : (
										<div className="space-y-6">
											<p className="text-carbon/80 dark:text-white/80 max-w-md mx-auto">
												Ready to cook? I'll analyze your Cargo and generate 3
												personalized recipes.
												<br />
												<span className="text-xs text-muted mt-2 block">
													Cost: 5 Credits
												</span>
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
									<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
										{recipes.map((recipe, idx) => (
											<div
												key={`${recipe.name}-${idx}`}
												className="flex flex-col bg-white dark:bg-white/5 border border-carbon/5 dark:border-white/10 rounded-xl overflow-hidden hover:shadow-lg transition-shadow group"
											>
												<div className="p-5 flex-1 cursor-default flex flex-col">
													<div className="flex items-start gap-3 mb-2">
														<input
															type="checkbox"
															id={`recipe-select-${idx}`}
															checked={selectedRecipes.has(idx)}
															onChange={() => toggleRecipe(idx)}
															className="mt-1 w-4 h-4 rounded border-platinum text-hyper-green focus:ring-hyper-green"
															aria-label={`Select ${recipe.name}`}
														/>
														<div className="flex-1 min-w-0">
															<h4 className="font-bold text-lg text-carbon dark:text-white group-hover:text-hyper-green transition-colors">
																{recipe.name}
															</h4>
															<p className="text-sm text-muted line-clamp-3 mb-4">
																{recipe.description}
															</p>

															<div className="flex gap-4 text-xs text-carbon/60 dark:text-white/60 mb-4">
																<div className="flex items-center gap-1">
																	<Timer className="w-3 h-3" />
																	{recipe.prepTime + recipe.cookTime}m
																</div>
																<div className="flex items-center gap-1">
																	<ChefHat className="w-3 h-3" />
																	{recipe.ingredients.length} ingr.
																</div>
															</div>

															{/* Missing Ingredients Warning */}
															{recipe.missingIngredients &&
																recipe.missingIngredients.length > 0 && (
																	<div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/30 rounded text-xs text-yellow-800 dark:text-yellow-300">
																		<strong>Missing:</strong>{" "}
																		{recipe.missingIngredients.join(", ")}
																	</div>
																)}

															<div className="space-y-1">
																<h5 className="text-xs font-bold text-carbon dark:text-white uppercase tracking-wider mb-2">
																	Key Ingredients
																</h5>
																{recipe.ingredients
																	.slice(0, 4)
																	.map((ing, _i) => (
																		<div
																			key={ing.ingredientName}
																			className="flex justify-between text-xs text-muted"
																		>
																			<span>{ing.ingredientName}</span>
																			<span>
																				{ing.quantity} {ing.unit}
																			</span>
																		</div>
																	))}
																{recipe.ingredients.length > 4 && (
																	<div className="text-xs text-muted italic pt-1">
																		+ {recipe.ingredients.length - 4} more
																	</div>
																)}
															</div>
														</div>
													</div>
												</div>
											</div>
										))}
									</div>

									{/* Batch Save Footer */}
									<div className="sticky bottom-0 p-4 bg-ceramic/95 dark:bg-[#1A1A1A]/95 border-t border-platinum dark:border-white/10 rounded-b-2xl flex flex-col gap-3">
										{saveFetcher.data &&
											typeof saveFetcher.data === "object" &&
											"error" in saveFetcher.data && (
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
											<button
												type="button"
												onClick={selectAll}
												className="text-sm text-muted hover:text-hyper-green transition-colors"
											>
												{selectedRecipes.size === recipes.length
													? "Deselect All"
													: "Select All"}
											</button>
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
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</>
	);
});

GenerateMealButton.displayName = "GenerateMealButton";
