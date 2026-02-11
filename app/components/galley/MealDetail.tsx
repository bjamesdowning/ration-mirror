import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Form, Link, useFetcher } from "react-router";
import { log } from "~/lib/logging.client";
import type { IngredientMatch, MissingIngredient } from "~/lib/matching.server";
import type { MealInput } from "~/lib/schemas/meal";

interface MealDetailProps {
	meal: MealInput & { id: string };
	isOwner: boolean;
}

interface IngredientAvailability {
	name: string;
	available: boolean;
	availableQuantity: number;
	requiredQuantity: number;
	unit: string;
}

export function MealDetail({ meal, isOwner }: MealDetailProps) {
	const [ingredientAvailability, setIngredientAvailability] = useState<
		IngredientAvailability[]
	>([]);
	const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);

	// Fetch ingredient availability for this meal
	useEffect(() => {
		const fetchAvailability = async () => {
			try {
				// Fetch matching data in strict mode to check if meal can be made
				const params = new URLSearchParams({
					mode: "strict",
					limit: "1",
				});

				const response = await fetch(`/api/meals/match?${params}`);
				const data = (await response.json()) as {
					results: Array<{
						meal: { id: string };
						availableIngredients: IngredientMatch[];
						missingIngredients: MissingIngredient[];
					}>;
				};

				// Find our meal in the results
				const matchResult = data.results.find(
					(result) => result.meal.id === meal.id,
				);

				if (matchResult) {
					// Build availability map
					const availability: IngredientAvailability[] = [
						...matchResult.availableIngredients.map((ing) => ({
							name: ing.name,
							available: true,
							availableQuantity: ing.availableQuantity,
							requiredQuantity: ing.requiredQuantity,
							unit: ing.unit,
						})),
						...matchResult.missingIngredients.map((ing) => ({
							name: ing.name,
							available: false,
							availableQuantity: 0,
							requiredQuantity: ing.requiredQuantity,
							unit: ing.unit,
						})),
					];
					setIngredientAvailability(availability);
				} else {
					// If meal not in results, check with delta mode to get status for all ingredients
					const deltaParams = new URLSearchParams({
						mode: "delta",
						minMatch: "0",
						limit: "100",
					});

					const deltaResponse = await fetch(`/api/meals/match?${deltaParams}`);
					const deltaData = (await deltaResponse.json()) as {
						results: Array<{
							meal: { id: string };
							availableIngredients: IngredientMatch[];
							missingIngredients: MissingIngredient[];
						}>;
					};

					const deltaResult = deltaData.results.find(
						(result) => result.meal.id === meal.id,
					);

					if (deltaResult) {
						const availability: IngredientAvailability[] = [
							...deltaResult.availableIngredients.map((ing) => ({
								name: ing.name,
								available: true,
								availableQuantity: ing.availableQuantity,
								requiredQuantity: ing.requiredQuantity,
								unit: ing.unit,
							})),
							...deltaResult.missingIngredients.map((ing) => ({
								name: ing.name,
								available: false,
								availableQuantity: 0,
								requiredQuantity: ing.requiredQuantity,
								unit: ing.unit,
							})),
						];
						setIngredientAvailability(availability);
					}
				}
			} catch (error) {
				log.error("Failed to fetch ingredient availability", error);
			} finally {
				setIsLoadingAvailability(false);
			}
		};

		fetchAvailability();
	}, [meal.id]);

	// Helper to get availability status for an ingredient
	const getAvailabilityStatus = (ingredientName: string) => {
		const match = ingredientAvailability.find(
			(ing) =>
				ing.name.toLowerCase().trim() === ingredientName.toLowerCase().trim(),
		);
		return match;
	};

	const fetcher = useFetcher<{ result: { cooked: boolean } }>();
	const isCooking = fetcher.state !== "idle";
	const isCooked = fetcher.data?.result?.cooked === true;

	return (
		<div className="max-w-4xl mx-auto space-y-8">
			{/* Header */}
			<div className="border-b border-platinum pb-6 flex justify-between items-start">
				<div>
					<div className="text-label text-muted text-xs mb-2">
						Recipe ID: {meal.id.slice(0, 8)}
					</div>
					<h1 className="text-display text-3xl text-carbon mb-2">
						{meal.name}
					</h1>
					{meal.description && (
						<p className="text-muted text-lg max-w-2xl">{meal.description}</p>
					)}
					{meal.customFields?.sourceUrl && (
						<a
							href={meal.customFields.sourceUrl as string}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-sm text-hyper-green hover:underline mt-2"
						>
							<ExternalLink className="w-3.5 h-3.5" />
							View Original Recipe
						</a>
					)}
				</div>
				<div className="flex flex-col gap-2 text-right">
					{isOwner && (
						<div className="flex gap-2 justify-end">
							<Link
								to="edit"
								className="text-muted hover:text-hyper-green px-3 py-1 text-sm transition-colors"
							>
								Edit
							</Link>
							<Form
								method="delete"
								onSubmit={(e) => {
									if (!confirm("Delete this recipe?")) {
										e.preventDefault();
									}
								}}
							>
								<button
									type="submit"
									className="text-muted hover:text-danger px-3 py-1 text-sm transition-colors"
								>
									Delete
								</button>
							</Form>
						</div>
					)}
					<div className="mt-4 flex gap-6 text-sm">
						<div className="flex flex-col items-center">
							<span className="text-label text-muted text-xs">Prep</span>
							<span className="text-data font-bold text-carbon">
								{meal.prepTime || "--"}m
							</span>
						</div>
						<div className="flex flex-col items-center">
							<span className="text-label text-muted text-xs">Cook</span>
							<span className="text-data font-bold text-carbon">
								{meal.cookTime || "--"}m
							</span>
						</div>
						<div className="flex flex-col items-center">
							<span className="text-label text-muted text-xs">Servings</span>
							<span className="text-data font-bold text-carbon">
								{meal.servings}
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
				{/* Right Col: Ingredients (Visual hierarchy: Ingredients are crucial data) */}
				<div className="lg:col-span-1 glass-panel rounded-xl p-6">
					<h3 className="text-label text-muted mb-4 flex items-center gap-2">
						<span className="w-2 h-2 rounded-full bg-hyper-green"></span>
						Ingredients
					</h3>
					<ul className="space-y-1">
						{meal.ingredients.map((ing) => {
							const availability = getAvailabilityStatus(ing.ingredientName);
							const isAvailable = availability?.available ?? true;
							const hasPartialStock =
								availability &&
								!availability.available &&
								availability.availableQuantity > 0;

							return (
								<li
									key={ing.ingredientName}
									className="flex items-center gap-3 py-2 border-b border-platinum last:border-0"
								>
									<div className="flex items-center gap-3 flex-1">
										{/* Availability Indicator */}
										{!isLoadingAvailability && (
											<div
												className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
													isAvailable
														? "bg-success/10"
														: hasPartialStock
															? "bg-warning/10"
															: "bg-danger/10"
												}`}
												title={
													isAvailable
														? "Available in inventory"
														: hasPartialStock
															? "Partial stock available"
															: "Not available"
												}
											>
												<span
													className={`w-2 h-2 rounded-full ${
														isAvailable
															? "bg-success"
															: hasPartialStock
																? "bg-warning"
																: "bg-danger"
													}`}
												></span>
											</div>
										)}
										<span
											className={`text-sm text-carbon ${!isAvailable ? "opacity-60" : ""}`}
										>
											{ing.ingredientName}
											{ing.isOptional && (
												<span className="text-xs ml-2 text-muted">
													(optional)
												</span>
											)}
										</span>
									</div>
									<div className="flex flex-col items-end">
										<span className="text-data font-bold text-carbon">
											{ing.quantity}{" "}
											<span className="text-muted text-xs">{ing.unit}</span>
										</span>
										{availability && !availability.available && (
											<span className="text-xs text-danger">
												Need:{" "}
												{availability.requiredQuantity -
													availability.availableQuantity}
											</span>
										)}
									</div>
								</li>
							);
						})}
					</ul>

					{/* Cook Action */}
					<fetcher.Form
						method="post"
						action={`/api/meals/${meal.id}/cook`}
						className="mt-8"
						onSubmit={(e: React.FormEvent) => {
							if (
								!confirm(
									"Cook this meal? It will deduct ingredients from your pantry.",
								)
							) {
								e.preventDefault();
							}
						}}
					>
						<button
							type="submit"
							disabled={isCooking}
							className={`w-full font-bold px-6 py-3 rounded-xl shadow-glow hover:shadow-glow transition-all ${
								isCooked
									? "bg-success text-carbon"
									: "bg-hyper-green text-carbon"
							} ${isCooking ? "opacity-75 cursor-wait" : ""}`}
						>
							{isCooking
								? "Cooking..."
								: isCooked
									? "Meal Cooked!"
									: "Cook Now"}
						</button>
						{isCooked && (
							<p className="text-xs text-center mt-2 text-success font-medium">
								Inventory updated successfully
							</p>
						)}
						{!isCooked && (
							<p className="text-xs text-center mt-2 text-muted">
								This will deduct ingredients from inventory
							</p>
						)}
					</fetcher.Form>
				</div>

				{/* Left Col: Directions */}
				<div className="lg:col-span-2">
					<h3 className="text-label text-muted mb-4 flex items-center gap-2">
						<span className="w-2 h-2 rounded-full bg-hyper-green"></span>
						Directions
					</h3>
					<div className="prose prose-sm max-w-none text-carbon">
						{meal.directions ? (
							<div className="whitespace-pre-wrap leading-relaxed bg-platinum/30 rounded-xl p-6">
								{meal.directions}
							</div>
						) : (
							<p className="text-muted italic bg-platinum/30 rounded-xl p-6">
								No directions provided
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
