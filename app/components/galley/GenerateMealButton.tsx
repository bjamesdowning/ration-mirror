import { AlertCircle, Check, ChefHat, Sparkles, Timer } from "lucide-react";
import { forwardRef, useImperativeHandle, useState } from "react";
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
	onGenerate?: () => void;
	className?: string;
}

export const GenerateMealButton = forwardRef<
	GenerateMealButtonHandle,
	GenerateMealButtonProps
>(({ onGenerate, className }, ref) => {
	const [showModal, setShowModal] = useState(false);
	const generateFetcher = useFetcher<{
		recipes: GeneratedRecipe[];
		error?: string;
	}>();
	const saveFetcher = useFetcher();
	const _navigate = useNavigate();

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

	const _handleGenerate = () => {
		if (onGenerate) {
			onGenerate();
		} else {
			setShowModal(true);
			generateFetcher.submit(
				{},
				{ method: "post", action: "/api/meals/generate" },
			);
		}
	};

	const handleSave = (recipe: GeneratedRecipe) => {
		// Transform to MealInput format
		const mealData = {
			name: recipe.name,
			description: recipe.description,
			directions: recipe.directions.join("\n"),
			prepTime: recipe.prepTime,
			cookTime: recipe.cookTime,
			ingredients: recipe.ingredients,
			tags: ["ai-generated"],
		};

		saveFetcher.submit(JSON.stringify(mealData), {
			method: "post",
			action: "/dashboard/meals/new",
			encType: "application/json",
		});
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
												Scanning Pantry...
											</h4>
											<p className="text-muted text-sm">
												Inventing recipes based on your stock.
											</p>
										</div>
									) : (
										<div className="space-y-6">
											<p className="text-carbon/80 dark:text-white/80 max-w-md mx-auto">
												Ready to cook? I'll analyze your inventory and generate
												3 personalized recipes.
												<br />
												<span className="text-xs text-muted mt-2 block">
													Cost: 5 Credits
												</span>
											</p>
											<button
												type="button"
												onClick={() =>
													generateFetcher.submit(
														{},
														{ method: "post", action: "/api/meals/generate" },
													)
												}
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
										onClick={() =>
											generateFetcher.submit(
												{},
												{ method: "post", action: "/api/meals/generate" },
											)
										}
										className="px-6 py-2 bg-platinum text-carbon dark:bg-white/10 dark:text-white rounded-lg hover:bg-platinum/80 dark:hover:bg-white/20"
									>
										Try Again
									</button>
								</div>
							)}

							{/* Results Grid */}
							{recipes && (
								<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
									{recipes.map((recipe, _idx) => (
										<div
											key={recipe.name}
											className="flex flex-col bg-white dark:bg-white/5 border border-carbon/5 dark:border-white/10 rounded-xl overflow-hidden hover:shadow-lg transition-shadow group"
										>
											<div className="p-5 flex-1 cursor-default">
												<h4 className="font-bold text-lg text-carbon dark:text-white mb-2 group-hover:text-hyper-green transition-colors">
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
													{recipe.ingredients.slice(0, 4).map((ing, _i) => (
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

											<div className="p-4 bg-platinum/30 dark:bg-white/5 border-t border-carbon/5 dark:border-white/10">
												<button
													type="button"
													onClick={() => handleSave(recipe)}
													disabled={saveFetcher.state !== "idle"}
													className="w-full py-2 bg-carbon dark:bg-white text-white dark:text-carbon font-medium rounded-lg hover:bg-carbon/90 dark:hover:bg-white/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
												>
													{saveFetcher.state !== "idle" ? (
														<span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
													) : (
														<>
															<Check className="w-4 h-4" />
															Save Recipe
														</>
													)}
												</button>
											</div>
										</div>
									))}
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
