import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { DirectionsEditor } from "./DirectionsEditor";
import { IngredientPicker } from "./IngredientPicker";

// Helper type for inventory item (matching IngredientPicker expectations)
type InventoryItem = {
	id: string;
	name: string;
	unit: string;
	quantity: number;
};

interface MealQuickAddProps {
	/** Callback when form is successfully submitted */
	onSuccess?: () => void;
	/** Called when the action returns a capacity_exceeded error so the parent can show an upgrade prompt */
	onUpgradeRequired?: () => void;
	/** Available pantry items for ingredient picker */
	availableIngredients?: InventoryItem[];
}

/**
 * Inline quick-add form for creating meals.
 * Supports both simple (name only) and complex (ingredients/directions) flows.
 */
export function MealQuickAdd({
	onSuccess,
	onUpgradeRequired,
	availableIngredients = [],
}: MealQuickAddProps) {
	const fetcher = useFetcher();
	const formRef = useRef<HTMLFormElement>(null);
	const nameInputRef = useRef<HTMLInputElement>(null);
	const isSubmitting = fetcher.state !== "idle";
	const [isExpanded, setIsExpanded] = useState(false);

	// Focus input on mount
	useEffect(() => {
		nameInputRef.current?.focus();
	}, []);

	// Handle successful submission or capacity gate
	useEffect(() => {
		if (fetcher.state !== "idle" || !fetcher.data) return;
		if (fetcher.data.error === "capacity_exceeded") {
			onUpgradeRequired?.();
			return;
		}
		if (!fetcher.data.error) {
			formRef.current?.reset();
			setIsExpanded(false);
			onSuccess?.();
		}
	}, [fetcher.state, fetcher.data, onSuccess, onUpgradeRequired]);

	return (
		<fetcher.Form
			ref={formRef}
			method="post"
			action="/dashboard/meals/new"
			className="space-y-4"
		>
			<div className="flex flex-col gap-4">
				{/* Name Input - Always Visible */}
				<div>
					<label
						htmlFor="quick-meal-name"
						className="block text-label text-muted mb-2 text-sm"
					>
						Meal Name
					</label>
					<input
						ref={nameInputRef}
						type="text"
						id="quick-meal-name"
						name="name"
						required
						placeholder="Enter meal name..."
						className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
					/>
				</div>

				{/* Expand Toggle */}
				<div>
					<button
						type="button"
						onClick={() => setIsExpanded(!isExpanded)}
						className="flex items-center text-xs text-muted hover:text-carbon font-medium transition-colors"
					>
						{isExpanded ? (
							<>
								<span className="mr-1">−</span> Less Details
							</>
						) : (
							<>
								<span className="mr-1">+</span> Add Details (Ingredients,
								Directions, etc.)
							</>
						)}
					</button>
				</div>

				{/* Expanded Section */}
				{isExpanded && (
					<div className="space-y-6 pt-2 animate-fade-in">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{/* Description */}
							<div>
								<label
									htmlFor="quick-meal-description"
									className="block text-label text-muted mb-2 text-sm"
								>
									Description
								</label>
								<input
									type="text"
									id="quick-meal-description"
									name="description"
									placeholder="Brief description..."
									className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
								/>
							</div>

							{/* Servings */}
							<div>
								<label
									htmlFor="quick-meal-servings"
									className="block text-label text-muted mb-2 text-sm"
								>
									Servings
								</label>
								<input
									type="number"
									id="quick-meal-servings"
									name="servings"
									defaultValue={2}
									min={1}
									className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
								/>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							{/* Prep Time */}
							<div>
								<label
									htmlFor="prepTime"
									className="block text-label text-muted mb-2 text-sm"
								>
									Prep Time (min)
								</label>
								<input
									type="number"
									name="prepTime"
									id="prepTime"
									className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
								/>
							</div>

							{/* Cook Time */}
							<div>
								<label
									htmlFor="cookTime"
									className="block text-label text-muted mb-2 text-sm"
								>
									Cook Time (min)
								</label>
								<input
									type="number"
									name="cookTime"
									id="cookTime"
									className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
								/>
							</div>
						</div>

						{/* Ingredients */}
						<div className="relative z-30">
							<h4 className="text-label text-muted text-sm mb-2">Components</h4>
							<IngredientPicker availableIngredients={availableIngredients} />
						</div>

						{/* Directions */}
						<div className="relative z-0">
							<DirectionsEditor />
						</div>

						{/* Tags */}
						<div>
							<label
								htmlFor="quick-meal-tags"
								className="block text-label text-muted mb-2 text-sm"
							>
								Tags (comma separated)
							</label>
							<input
								type="text"
								id="quick-meal-tags"
								name="tags"
								placeholder="e.g. breakfast, quick, vegetarian"
								className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							/>
						</div>
					</div>
				)}
			</div>

			{/* Helper Text */}
			{!isExpanded && (
				<p className="text-xs text-muted">
					Quick create a meal - or expand to add full recipe details.
				</p>
			)}

			{/* Error Display (non-capacity errors only; capacity_exceeded is handled by parent via onUpgradeRequired) */}
			{fetcher.data?.error && fetcher.data.error !== "capacity_exceeded" && (
				<div className="bg-danger/10 text-danger text-sm px-4 py-2 rounded-lg">
					{fetcher.data.error}
				</div>
			)}

			{/* Submit Button */}
			<div className="flex justify-end">
				<button
					type="submit"
					disabled={isSubmitting}
					className="bg-hyper-green text-carbon font-bold px-6 py-3 rounded-lg shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-50"
				>
					{isSubmitting
						? "Creating..."
						: isExpanded
							? "Create Full Recipe"
							: "Create Meal"}
				</button>
			</div>
		</fetcher.Form>
	);
}
