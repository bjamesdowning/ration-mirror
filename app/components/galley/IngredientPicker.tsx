import { useState } from "react";

import type { inventory } from "~/db/schema";
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
		<div className="space-y-4 border border-[#39FF14]/30 p-4 bg-[#051105]/50">
			<div className="flex justify-between items-center">
				<h3 className="text-[#39FF14] font-mono text-sm uppercase">
					Components
				</h3>
				<button
					type="button"
					onClick={addIngredient}
					className="px-2 py-1 bg-[#39FF14]/20 text-[#39FF14] border border-[#39FF14] text-xs font-mono uppercase hover:bg-[#39FF14]/30"
				>
					+ Add Component
				</button>
			</div>

			{ingredients.map((ing, idx) => (
				<div
					key={ing.localId}
					className="grid grid-cols-12 gap-2 items-center border-b border-[#39FF14]/10 pb-2"
				>
					{/* Hidden inputs for form submission */}
					<input
						type="hidden"
						name={`ingredients[${idx}].orderIndex`}
						value={idx}
					/>

					<div className="col-span-1 text-[#39FF14]/50 font-mono text-xs">
						{(idx + 1).toString().padStart(2, "0")}
					</div>

					<div className="col-span-5">
						<input
							type="text"
							name={`ingredients[${idx}].ingredientName`}
							value={ing.ingredientName}
							onChange={(e) =>
								updateIngredient(idx, "ingredientName", e.target.value)
							}
							placeholder="COMPONENT NAME"
							className="w-full bg-transparent border-b border-[#39FF14]/30 text-[#39FF14] font-mono text-sm focus:outline-none focus:border-[#39FF14]"
						/>
					</div>

					<div className="col-span-2">
						<input
							type="number"
							step="any"
							name={`ingredients[${idx}].quantity`}
							value={ing.quantity}
							onChange={(e) =>
								updateIngredient(idx, "quantity", e.target.value)
							}
							placeholder="QTY"
							className="w-full bg-transparent border-b border-[#39FF14]/30 text-[#39FF14] font-mono text-sm text-right focus:outline-none focus:border-[#39FF14]"
						/>
					</div>

					<div className="col-span-2">
						<input
							type="text"
							name={`ingredients[${idx}].unit`}
							value={ing.unit}
							onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
							placeholder="UNIT"
							className="w-full bg-transparent border-b border-[#39FF14]/30 text-[#39FF14] font-mono text-xs focus:outline-none focus:border-[#39FF14]"
						/>
					</div>

					<div className="col-span-2 text-right">
						<button
							type="button"
							onClick={() => removeIngredient(idx)}
							className="text-red-500 hover:text-red-400 font-mono text-xs uppercase"
						>
							[REM]
						</button>
					</div>
				</div>
			))}
			{ingredients.length === 0 && (
				<div className="text-center text-[#39FF14]/30 font-mono text-xs italic py-4">
					{"//"} NO COMPONENTS ASSIGNED
				</div>
			)}
		</div>
	);
}
