import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { MealIngredientInput } from "~/lib/schemas/meal";
import { SUPPORTED_UNITS, toSupportedUnit } from "~/lib/units";

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
		const handleClickOutside = (event: PointerEvent) => {
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

		document.addEventListener("pointerdown", handleClickOutside);
		return () => {
			document.removeEventListener("pointerdown", handleClickOutside);
		};
	}, [activeIndex]);

	const addIngredient = () => {
		setIngredients([
			...ingredients,
			{
				localId: crypto.randomUUID(),
				ingredientName: "",
				quantity: 1,
				unit: "unit",
				cargoId: null,
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
			unit: toSupportedUnit(item.unit),
			cargoId: item.id,
		};
		setIngredients(newIngredients);
		setActiveIndex(null);
	};

	return (
		<div className="glass-panel rounded-xl p-4 space-y-4 relative overflow-visible">
			<div className="flex justify-between items-center">
				<h3 className="text-label text-muted text-sm">Components</h3>
				<div className="flex items-center gap-2">
					<Link
						to="/tools/unit-converter"
						target="_blank"
						rel="noopener noreferrer"
						className="text-xs text-muted hover:text-hyper-green transition-colors font-mono"
						title="Open cooking unit converter"
					>
						⇄ Convert units
					</Link>
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
					className={`border-b border-platinum pb-3 relative ${
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
						name={`ingredients[${idx}].cargoId`}
						value={ing.cargoId || ""}
					/>

					{/* Main row: badge + name + qty + unit */}
					<div className="grid grid-cols-12 gap-2 items-center">
						<div className="col-span-1 bg-hyper-green text-carbon text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0">
							{idx + 1}
						</div>

						<div className="col-span-6 sm:col-span-5 relative">
							<input
								ref={(el) => {
									inputRefs.current[idx] = el;
								}}
								type="text"
								inputMode="text"
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
									className="absolute z-[100] left-0 right-0 mt-1 bg-ceramic dark:bg-white/10 border border-platinum dark:border-white/10 rounded-lg shadow-lg max-h-48 overflow-y-auto"
								>
									{filteredOptions.length > 0 ? (
										filteredOptions.map((option) => (
											<button
												key={option.id}
												type="button"
												onClick={() => selectOption(idx, option)}
												className="w-full text-left px-3 py-2 text-sm text-carbon dark:text-white hover:bg-platinum dark:hover:bg-white/10 transition-colors flex justify-between items-center"
											>
												<span>{option.name}</span>
												<span className="text-xs text-muted font-mono bg-platinum/50 dark:bg-white/10 px-1.5 py-0.5 rounded">
													{option.unit}
												</span>
											</button>
										))
									) : (
										<div className="px-3 py-2 text-xs text-muted dark:text-white/70 italic">
											{availableIngredients.length === 0 ? (
												<>
													Your Cargo is empty.
													<br />
													<span className="opacity-75">
														Add items in Supply first.
													</span>
												</>
											) : (
												<>
													No matching Cargo items.
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
								inputMode="decimal"
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

						<div className="col-span-3 sm:col-span-2">
							<select
								name={`ingredients[${idx}].unit`}
								value={toSupportedUnit(ing.unit)}
								onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
								className="w-full bg-platinum rounded-lg px-3 py-2 text-carbon text-xs focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							>
								{SUPPORTED_UNITS.map((u) => (
									<option key={u} value={u}>
										{u}
									</option>
								))}
							</select>
						</div>

						{/* Desktop-only: optional toggle + remove inline */}
						<div className="hidden sm:flex col-span-1 items-center justify-end">
							<label
								className="flex items-center cursor-pointer"
								title="Optional"
							>
								<input
									type="checkbox"
									name={`ingredients[${idx}].isOptional`}
									value="true"
									checked={ing.isOptional ?? false}
									onChange={(e) =>
										updateIngredient(idx, "isOptional", e.target.checked)
									}
									className="rounded border-muted accent-hyper-green focus:ring-2 focus:ring-hyper-green/50 focus:ring-offset-0"
								/>
							</label>
						</div>

						<div className="hidden sm:flex col-span-1 items-center justify-end">
							<button
								type="button"
								onClick={() => removeIngredient(idx)}
								aria-label="Remove ingredient"
								className="flex items-center justify-center w-6 h-6 text-danger hover:text-danger/80 transition-colors"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						</div>
					</div>

					{/* Mobile-only: action bar below the main row */}
					<div className="flex sm:hidden items-center justify-between mt-2 pl-8">
						<label className="flex items-center gap-1.5 cursor-pointer select-none">
							<input
								type="checkbox"
								name={`ingredients[${idx}].isOptional`}
								value="true"
								checked={ing.isOptional ?? false}
								onChange={(e) =>
									updateIngredient(idx, "isOptional", e.target.checked)
								}
								className="rounded border-muted accent-hyper-green focus:ring-2 focus:ring-hyper-green/50 focus:ring-offset-0"
							/>
							<span className="text-xs text-muted">Optional</span>
						</label>

						<button
							type="button"
							onClick={() => removeIngredient(idx)}
							aria-label="Remove ingredient"
							className="flex items-center gap-1 text-danger hover:text-danger/80 transition-colors p-1 -mr-1"
						>
							{/* Trash icon */}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<polyline points="3 6 5 6 21 6" />
								<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
								<path d="M10 11v6" />
								<path d="M14 11v6" />
								<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
							</svg>
							<span className="text-xs font-medium">Remove</span>
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
