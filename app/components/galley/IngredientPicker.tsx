import { useState } from "react";

import type { MealIngredientInput } from "~/lib/schemas/meal"; // Implied type from schema

type IngredientWithId = MealIngredientInput & { localId: string };

interface IngredientPickerProps {
	defaultValue?: MealIngredientInput[];
}

export function IngredientPicker({ defaultValue = [] }: IngredientPickerProps) {
	const [ingredients, setIngredients] = useState<IngredientWithId[]>(
		defaultValue.map((ing) => ({ ...ing, localId: crypto.randomUUID() })),
	);
	// In a real implementation, we'd use a fetcher to search inventory
	// but for now let's assume we can fetch all or search via API
	// simpler version: Just text inputs for Phase 1 MVP if search is complex
	// But requirements say "inventory search integration".
	// We can use a fetcher to get inventory list for autocomplete.

	// const inventoryFetcher = useFetcher<{ inventory: InventoryItem[] }>();

	const addIngredient = () => {
		setIngredients([
			...ingredients,
			{
				localId: crypto.randomUUID(),
				ingredientName: "",
				quantity: 0,
				unit: "unit",
				isOptional: false,
				orderIndex: ingredients.length,
			},
		]);
	};

	const removeIngredient = (index: number) => {
		const newIngredients = [...ingredients];
		newIngredients.splice(index, 1);
		setIngredients(newIngredients);
	};

	const updateIngredient = (
		index: number,
		field: keyof MealIngredientInput,
		value: string | number | boolean | null | undefined,
	) => {
		const newIngredients = [...ingredients];
		newIngredients[index] = { ...newIngredients[index], [field]: value };
		setIngredients(newIngredients);
	};

	return (
		<div className="glass-panel rounded-xl p-4 space-y-4">
			<div className="flex justify-between items-center">
				<h3 className="text-label text-muted text-sm">Components</h3>
				<button
					type="button"
					onClick={addIngredient}
					className="px-3 py-1.5 bg-hyper-green/10 text-hyper-green rounded-lg text-xs font-medium hover:bg-hyper-green/20 transition-colors"
				>
					+ Add Component
				</button>
			</div>

			{ingredients.map((ing, idx) => (
				<div
					key={ing.localId}
					className="grid grid-cols-12 gap-2 items-center border-b border-platinum pb-3"
				>
					{/* Hidden inputs for form submission */}
					<input
						type="hidden"
						name={`ingredients[${idx}].orderIndex`}
						value={idx}
					/>

					<div className="col-span-1 bg-hyper-green text-carbon text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
						{idx + 1}
					</div>

					<div className="col-span-5">
						<input
							type="text"
							name={`ingredients[${idx}].ingredientName`}
							value={ing.ingredientName}
							onChange={(e) =>
								updateIngredient(idx, "ingredientName", e.target.value)
							}
							placeholder="Component name"
							className="w-full bg-platinum rounded-lg px-3 py-2 text-carbon text-sm placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>

					<div className="col-span-2">
						<input
							type="number"
							step="any"
							name={`ingredients[${idx}].quantity`}
							value={ing.quantity}
							onChange={(e) =>
								updateIngredient(
									idx,
									"quantity",
									Number.parseFloat(e.target.value) || 0,
								)
							}
							placeholder="Qty"
							className="w-full bg-platinum rounded-lg px-3 py-2 text-carbon text-sm text-right placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>

					<div className="col-span-2">
						<input
							type="text"
							name={`ingredients[${idx}].unit`}
							value={ing.unit}
							onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
							placeholder="Unit"
							className="w-full bg-platinum rounded-lg px-3 py-2 text-carbon text-xs placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>

					<div className="col-span-2 text-right">
						<button
							type="button"
							onClick={() => removeIngredient(idx)}
							className="text-danger hover:text-danger/80 text-xs font-medium transition-colors"
						>
							Remove
						</button>
					</div>
				</div>
			))}
			{ingredients.length === 0 && (
				<div className="text-center text-muted text-sm py-4 bg-platinum/50 rounded-lg">
					No components assigned
				</div>
			)}
		</div>
	);
}
