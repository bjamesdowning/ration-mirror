import { useEffect, useRef, useState } from "react";

import type { MealIngredientInput } from "~/lib/schemas/meal";

type IngredientWithId = MealIngredientInput & { localId: string };

// Basic inventory item type matching what we passed down
type InventoryItem = {
	id: string;
	name: string;
	unit: string;
	quantity: number;
};

interface IngredientPickerProps {
	defaultValue?: MealIngredientInput[];
	availableIngredients?: InventoryItem[];
}

export function IngredientPicker({
	defaultValue = [],
	availableIngredients = [],
}: IngredientPickerProps) {
	const [ingredients, setIngredients] = useState<IngredientWithId[]>(
		defaultValue.map((ing) => ({ ...ing, localId: crypto.randomUUID() })),
	);

	// Track which input has the active dropdown
	const [activeIndex, setActiveIndex] = useState<number | null>(null);
	// Filtered options based on current input
	const [filteredOptions, setFilteredOptions] = useState<InventoryItem[]>([]);

	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (activeIndex !== null) {
				const dropdown = document.getElementById("ingredient-dropdown");
				const input = inputRefs.current[activeIndex];
				if (
					dropdown &&
					!dropdown.contains(event.target as Node) &&
					input &&
					!input.contains(event.target as Node)
				) {
					setActiveIndex(null);
				}
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [activeIndex]);

	const addIngredient = () => {
		setIngredients([
			...ingredients,
			{
				localId: crypto.randomUUID(),
				ingredientName: "",
				quantity: 0,
				unit: "unit",
				inventoryId: null,
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

		// If updating name, filter options
		if (field === "ingredientName" && typeof value === "string") {
			filterOptions(value);
			setActiveIndex(index);
		}
	};

	const filterOptions = (query: string) => {
		if (!query) {
			setFilteredOptions(availableIngredients.slice(0, 10));
			return;
		}
		const lowerQuery = query.toLowerCase();
		const filtered = availableIngredients
			.filter((item) => item.name.toLowerCase().includes(lowerQuery))
			.slice(0, 10);
		setFilteredOptions(filtered);
	};

	const handleInputFocus = (index: number) => {
		setActiveIndex(index);
		const currentName = ingredients[index].ingredientName;
		filterOptions(currentName);
	};

	const selectOption = (index: number, item: InventoryItem) => {
		const newIngredients = [...ingredients];
		newIngredients[index] = {
			...newIngredients[index],
			ingredientName: item.name,
			unit: item.unit,
			inventoryId: item.id,
		};
		setIngredients(newIngredients);
		setActiveIndex(null);
	};

	return (
		<div className="glass-panel rounded-xl p-4 space-y-4 relative overflow-visible">
			<div className="flex justify-between items-center">
				<h3 className="text-label text-muted text-sm">Components</h3>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={addIngredient}
						className="px-3 py-1.5 bg-hyper-green/10 text-hyper-green rounded-lg text-xs font-medium hover:bg-hyper-green/20 transition-colors"
					>
						+ Custom
					</button>
				</div>
			</div>

			{ingredients.map((ing, idx) => (
				<div
					key={ing.localId}
					className={`grid grid-cols-12 gap-2 items-center border-b border-platinum pb-3 relative ${
						activeIndex === idx ? "z-20" : "z-0"
					}`}
				>
					{/* Hidden inputs for form submission */}
					<input
						type="hidden"
						name={`ingredients[${idx}].orderIndex`}
						value={idx}
					/>
					<input
						type="hidden"
						name={`ingredients[${idx}].inventoryId`}
						value={ing.inventoryId || ""}
					/>

					<div className="col-span-1 bg-hyper-green text-carbon text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
						{idx + 1}
					</div>

					<div className="col-span-5 relative">
						<input
							ref={(el) => {
								inputRefs.current[idx] = el;
							}}
							type="text"
							name={`ingredients[${idx}].ingredientName`}
							value={ing.ingredientName}
							onChange={(e) =>
								updateIngredient(idx, "ingredientName", e.target.value)
							}
							onFocus={() => handleInputFocus(idx)}
							placeholder="Component name"
							className="w-full bg-platinum rounded-lg px-3 py-2 text-carbon text-sm placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							autoComplete="off"
						/>
						{/* Dropdown */}
						{activeIndex === idx && (
							<div
								id="ingredient-dropdown"
								className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-platinum rounded-lg shadow-lg max-h-48 overflow-y-auto"
							>
								{filteredOptions.length > 0 ? (
									filteredOptions.map((option) => (
										<button
											key={option.id}
											type="button"
											onClick={() => selectOption(idx, option)}
											className="w-full text-left px-3 py-2 text-sm text-carbon hover:bg-platinum transition-colors flex justify-between items-center"
										>
											<span>{option.name}</span>
											<span className="text-xs text-muted font-mono bg-platinum/50 px-1.5 py-0.5 rounded">
												{option.unit}
											</span>
										</button>
									))
								) : (
									<div className="px-3 py-2 text-xs text-muted italic">
										{availableIngredients.length === 0 ? (
											<>
												Your pantry is empty.
												<br />
												<span className="opacity-75">
													Add items in Supply first.
												</span>
											</>
										) : (
											<>
												No matching pantry items.
												<br />
												Type to add custom.
											</>
										)}
									</div>
								)}
							</div>
						)}
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
