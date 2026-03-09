import { ExternalLink, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import { CheckIcon, PlusIcon } from "~/components/icons/PageIcons";
import { AllergenWarningBadge } from "~/components/shared/AllergenWarningBadge";
import type { AllergenSlug } from "~/lib/allergens";
import { detectAllergens } from "~/lib/allergens";
import { useConfirm } from "~/lib/confirm-context";
import { formatQuantity } from "~/lib/format-quantity";
import { log } from "~/lib/logging.client";
import type { IngredientMatch, MissingIngredient } from "~/lib/matching.server";
import { scaleQuantity } from "~/lib/scale";
import { parseDirections } from "~/lib/schemas/directions";
import type { MealInput } from "~/lib/schemas/meal";
import { DirectionsSteps } from "./DirectionsSteps";

interface MealDetailProps {
	meal: MealInput & { id: string };
	isOwner: boolean;
	/** User's declared allergen slugs — used to display warning banner. */
	userAllergens?: AllergenSlug[];
	/** Whether this meal is selected for Supply list (same as Galley add-meal toggle). */
	isSelectedForSupply?: boolean;
}

interface IngredientAvailability {
	name: string;
	available: boolean;
	availableQuantity: number;
	requiredQuantity: number;
	unit: string;
}

const MIN_SERVINGS = 1;
const MAX_SERVINGS = 99;

export function MealDetail({
	meal,
	isOwner,
	userAllergens = [],
	isSelectedForSupply = false,
}: MealDetailProps) {
	const baseServings = meal.servings ?? 1;
	const [desiredServings, setDesiredServings] = useState(baseServings);
	const [inputValue, setInputValue] = useState(String(baseServings));
	const inputRef = useRef<HTMLInputElement>(null);

	const scaleFactor = baseServings > 0 ? desiredServings / baseServings : 1;
	const isScaled = desiredServings !== baseServings;

	const [ingredientAvailability, setIngredientAvailability] = useState<
		IngredientAvailability[]
	>([]);
	const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);

	// Re-fetch availability whenever desiredServings changes
	useEffect(() => {
		let cancelled = false;
		setIsLoadingAvailability(true);

		const fetchAvailability = async () => {
			try {
				const params = new URLSearchParams({
					mode: "strict",
					limit: "1",
					servings: String(desiredServings),
				});

				const response = await fetch(`/api/meals/match?${params}`);
				const rawData = (await response.json()) as {
					results: Array<{
						meal: { id: string };
						availableIngredients: IngredientMatch[];
						missingIngredients: MissingIngredient[];
					}>;
				};

				if (cancelled) return;

				const matchResult = rawData.results.find(
					(result) => result.meal.id === meal.id,
				);

				if (matchResult) {
					setIngredientAvailability([
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
					]);
				} else {
					// Delta fallback to get status for all ingredients
					const deltaParams = new URLSearchParams({
						mode: "delta",
						minMatch: "0",
						limit: "100",
						servings: String(desiredServings),
					});

					const deltaResponse = await fetch(`/api/meals/match?${deltaParams}`);
					const deltaData = (await deltaResponse.json()) as {
						results: Array<{
							meal: { id: string };
							availableIngredients: IngredientMatch[];
							missingIngredients: MissingIngredient[];
						}>;
					};

					if (cancelled) return;

					const deltaResult = deltaData.results.find(
						(result) => result.meal.id === meal.id,
					);

					if (deltaResult) {
						setIngredientAvailability([
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
						]);
					}
				}
			} catch (error) {
				log.error("Failed to fetch ingredient availability", error);
			} finally {
				if (!cancelled) setIsLoadingAvailability(false);
			}
		};

		fetchAvailability();
		return () => {
			cancelled = true;
		};
	}, [meal.id, desiredServings]);

	const getAvailabilityStatus = (ingredientName: string) => {
		return ingredientAvailability.find(
			(ing) =>
				ing.name.toLowerCase().trim() === ingredientName.toLowerCase().trim(),
		);
	};

	const { confirm } = useConfirm();
	const deleteFetcher = useFetcher();
	const toggleSupplyFetcher = useFetcher<{
		success?: boolean;
		isActive?: boolean;
	}>();
	const [localSelectedForSupply, setLocalSelectedForSupply] =
		useState(isSelectedForSupply);
	const fetcher = useFetcher<{
		result?: { cooked: boolean };
		error?: string;
	}>();
	const isCooking = fetcher.state !== "idle";
	const isDeleting = deleteFetcher.state !== "idle";
	const isCooked = fetcher.data?.result?.cooked === true;
	const cookError =
		fetcher.state === "idle" && fetcher.data?.error
			? fetcher.data.error.replace(
					/^Insufficient Cargo for:\s*/i,
					"You don't have enough: ",
				)
			: null;

	const handleServingsChange = (next: number) => {
		const clamped = Math.max(MIN_SERVINGS, Math.min(MAX_SERVINGS, next));
		setDesiredServings(clamped);
		setInputValue(String(clamped));
	};

	const handleInputBlur = () => {
		const parsed = Number.parseInt(inputValue, 10);
		if (Number.isNaN(parsed) || parsed < MIN_SERVINGS) {
			handleServingsChange(MIN_SERVINGS);
		} else {
			handleServingsChange(parsed);
		}
	};

	const handleDelete = async () => {
		if (
			!(await confirm({
				title: "Delete this meal?",
				message: "This cannot be undone.",
				confirmLabel: "Delete",
				variant: "danger",
			}))
		)
			return;
		deleteFetcher.submit(null, {
			method: "DELETE",
			action: `/hub/galley/${meal.id}`,
		});
	};

	useEffect(() => {
		if (
			toggleSupplyFetcher.state === "idle" &&
			toggleSupplyFetcher.data?.isActive !== undefined
		) {
			setLocalSelectedForSupply(toggleSupplyFetcher.data.isActive);
		} else if (toggleSupplyFetcher.state === "idle") {
			setLocalSelectedForSupply(isSelectedForSupply);
		}
	}, [
		toggleSupplyFetcher.state,
		toggleSupplyFetcher.data?.isActive,
		isSelectedForSupply,
	]);

	const handleToggleSupply = () => {
		const nextActive = !localSelectedForSupply;
		setLocalSelectedForSupply(nextActive);
		if (nextActive) {
			toggleSupplyFetcher.submit(
				JSON.stringify({ servings: desiredServings }),
				{
					method: "POST",
					action: `/api/meals/${meal.id}/toggle-active`,
					encType: "application/json",
				},
			);
		} else {
			toggleSupplyFetcher.submit(null, {
				method: "POST",
				action: `/api/meals/${meal.id}/toggle-active`,
			});
		}
	};

	const handleCookSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const form = e.currentTarget;
		const servingLabel =
			desiredServings === 1 ? "1 serving" : `${desiredServings} servings`;
		if (
			!(await confirm({
				title: `Cook this meal for ${servingLabel}?`,
				message: "It will deduct ingredients from your Cargo.",
				confirmLabel: "Cook Now",
				variant: "warning",
			}))
		)
			return;
		fetcher.submit(new FormData(form), {
			method: "POST",
			action: form.action,
		});
	};

	const ingredientNames = meal.ingredients.map((i) => i.ingredientName);
	const triggeredAllergens = detectAllergens(ingredientNames, userAllergens);

	return (
		<div className="max-w-4xl mx-auto space-y-8">
			{/* Allergen warning banner */}
			{triggeredAllergens.length > 0 && (
				<AllergenWarningBadge triggered={triggeredAllergens} />
			)}

			{/* Header */}
			<div className="border-b border-platinum pb-6 flex justify-between items-start">
				<div>
					<div className="text-label text-muted text-xs mb-2">
						Meal ID: {meal.id.slice(0, 8)}
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
							View Source
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
							<button
								type="button"
								onClick={handleDelete}
								disabled={isDeleting}
								className="text-muted hover:text-danger px-3 py-1 text-sm transition-colors disabled:opacity-50"
							>
								{isDeleting ? "Deleting..." : "Delete"}
							</button>
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
						{/* Servings stepper */}
						<div className="flex flex-col items-center">
							<span className="text-label text-muted text-xs">Servings</span>
							<div className="flex items-center gap-1 mt-0.5">
								<button
									type="button"
									aria-label="Decrease servings"
									disabled={desiredServings <= MIN_SERVINGS}
									onClick={() => handleServingsChange(desiredServings - 1)}
									className="w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-carbon hover:bg-platinum transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
								>
									<Minus className="w-3.5 h-3.5" />
								</button>
								<input
									ref={inputRef}
									type="number"
									min={MIN_SERVINGS}
									max={MAX_SERVINGS}
									value={inputValue}
									onChange={(e) => setInputValue(e.target.value)}
									onBlur={handleInputBlur}
									onKeyDown={(e) => {
										if (e.key === "Enter") inputRef.current?.blur();
									}}
									className="w-9 text-center text-data font-bold text-carbon bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-hyper-green rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
								/>
								<button
									type="button"
									aria-label="Increase servings"
									disabled={desiredServings >= MAX_SERVINGS}
									onClick={() => handleServingsChange(desiredServings + 1)}
									className="w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-carbon hover:bg-platinum transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
								>
									<Plus className="w-3.5 h-3.5" />
								</button>
							</div>
							{isScaled && (
								<span className="text-xs text-hyper-green font-medium mt-0.5">
									{scaleFactor >= 1
										? `${scaleFactor.toFixed(scaleFactor % 1 === 0 ? 0 : 1)}×`
										: `÷${(1 / scaleFactor).toFixed((1 / scaleFactor) % 1 === 0 ? 0 : 1)}`}
								</span>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Main Content Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
				{/* Right Col: Ingredients */}
				<div className="lg:col-span-1 glass-panel rounded-xl p-6">
					<h3 className="text-label text-muted mb-4 flex items-center gap-2">
						<span className="w-2 h-2 rounded-full bg-hyper-green" />
						Ingredients
						{isScaled && (
							<span className="text-xs text-hyper-green font-medium ml-auto">
								scaled
							</span>
						)}
					</h3>
					<ul className="space-y-1">
						{meal.ingredients.map((ing) => {
							const availability = getAvailabilityStatus(ing.ingredientName);
							const isAvailable = availability?.available ?? true;
							const hasPartialStock =
								availability &&
								!availability.available &&
								availability.availableQuantity > 0;

							const displayQty = scaleQuantity(
								ing.quantity,
								scaleFactor,
								ing.unit,
							);

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
														? "Available in Cargo"
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
												/>
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
											{formatQuantity(displayQty, ing.unit)}
										</span>
										{availability && !availability.available && (
											<span className="text-xs text-danger">
												Need:{" "}
												{formatQuantity(
													Math.max(
														0,
														availability.requiredQuantity -
															availability.availableQuantity,
													),
													ing.unit,
												)}
											</span>
										)}
									</div>
								</li>
							);
						})}
					</ul>

					{/* Add to Supply */}
					<button
						type="button"
						onClick={handleToggleSupply}
						disabled={toggleSupplyFetcher.state !== "idle"}
						title={
							localSelectedForSupply
								? "Remove from Supply list"
								: "Add to Supply list"
						}
						className={`mb-4 w-full flex items-center justify-center gap-2 font-semibold px-6 py-3 rounded-xl transition-all ${
							localSelectedForSupply
								? "bg-hyper-green/10 text-hyper-green border border-hyper-green"
								: "bg-platinum text-carbon border border-platinum hover:border-hyper-green/50"
						} ${toggleSupplyFetcher.state !== "idle" ? "opacity-75 cursor-wait" : ""}`}
					>
						{localSelectedForSupply ? (
							<>
								<CheckIcon className="w-4 h-4" />
								Remove from Supply
							</>
						) : (
							<>
								<PlusIcon className="w-4 h-4" />
								Add to Supply
							</>
						)}
					</button>

					{/* Cook Action */}
					{cookError && (
						<div
							role="alert"
							className="mb-4 rounded-xl border border-warning/50 bg-warning/5 px-4 py-3 text-sm text-carbon"
						>
							<p className="font-medium text-carbon">
								We couldn't deduct ingredients from Cargo.
							</p>
							<p className="mt-1 text-muted">{cookError}</p>
							<p className="mt-2 text-xs text-muted">
								Update the quantities above or add items to Cargo, then try
								again.
							</p>
						</div>
					)}
					<form
						method="post"
						action={`/api/meals/${meal.id}/cook`}
						className="mt-8"
						onSubmit={handleCookSubmit}
					>
						<input type="hidden" name="servings" value={desiredServings} />
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
									: desiredServings !== baseServings
										? `Cook × ${desiredServings}`
										: "Cook Now"}
						</button>
						{isCooked && (
							<p className="text-xs text-center mt-2 text-success font-medium">
								Cargo updated successfully
							</p>
						)}
						{!isCooked && !cookError && (
							<p className="text-xs text-center mt-2 text-muted">
								{desiredServings === baseServings
									? "This will deduct ingredients from Cargo"
									: `Scaled for ${desiredServings} serving${desiredServings !== 1 ? "s" : ""} (base: ${baseServings})`}
							</p>
						)}
					</form>
				</div>

				{/* Left Col: Directions */}
				<div className="lg:col-span-2">
					<h3 className="text-label text-muted mb-4 flex items-center gap-2">
						<span className="w-2 h-2 rounded-full bg-hyper-green" />
						Directions
					</h3>
					<DirectionsSteps
						steps={parseDirections(meal.directions)}
						mealName={meal.name}
					/>
				</div>
			</div>
		</div>
	);
}
