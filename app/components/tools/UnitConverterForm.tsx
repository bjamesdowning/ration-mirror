import { useMemo, useState } from "react";
import { Link } from "react-router";
import { lookupDensity } from "~/lib/ingredient-density";
import {
	formatConversionResult,
	parseQuantityInput,
	quantityInputErrorMessage,
} from "~/lib/parse-quantity-input";
import {
	convertToolUnits,
	getToolUnit,
	isCrossKind,
	TOOL_UNIT_GROUPS,
	TOOL_UNITS,
} from "~/lib/tool-units";
import {
	type ComboboxIngredient,
	IngredientCombobox,
} from "./IngredientCombobox";

// ─── Ingredient catalogue ─────────────────────────────────────────────────────

type IngredientEntry = { label: string; key: string };
type IngredientCategory = { category: string; items: IngredientEntry[] };

export const INGREDIENT_CATEGORIES: IngredientCategory[] = [
	{
		category: "Flours & Starches",
		items: [
			{ label: "All-purpose flour", key: "all purpose flour" },
			{ label: "Bread flour", key: "bread flour" },
			{ label: "Cake flour", key: "cake flour" },
			{ label: "Self-rising flour", key: "self rising flour" },
			{ label: "Whole wheat flour", key: "whole wheat flour" },
			{ label: "Almond flour", key: "almond flour" },
			{ label: "Coconut flour", key: "coconut flour" },
			{ label: "Oat flour", key: "oat flour" },
			{ label: "Rice flour", key: "rice flour" },
			{ label: "Buckwheat flour", key: "buckwheat flour" },
			{ label: "Rye flour", key: "rye flour" },
			{ label: "Spelt flour", key: "spelt flour" },
			{ label: "Chickpea flour", key: "chickpea flour" },
			{ label: "Semolina", key: "semolina" },
			{ label: "Cornstarch", key: "cornstarch" },
			{ label: "Tapioca starch", key: "tapioca starch" },
			{ label: "Potato starch", key: "potato starch" },
		],
	},
	{
		category: "Sugars & Sweeteners",
		items: [
			{ label: "Granulated sugar", key: "granulated sugar" },
			{ label: "Caster sugar", key: "caster sugar" },
			{ label: "Powdered / icing sugar", key: "powdered sugar" },
			{ label: "Brown sugar", key: "brown sugar" },
			{ label: "Demerara sugar", key: "demerara sugar" },
			{ label: "Coconut sugar", key: "coconut sugar" },
			{ label: "Honey", key: "honey" },
			{ label: "Maple syrup", key: "maple syrup" },
			{ label: "Golden syrup", key: "golden syrup" },
			{ label: "Molasses", key: "molasses" },
			{ label: "Corn syrup", key: "corn syrup" },
			{ label: "Agave syrup", key: "agave syrup" },
		],
	},
	{
		category: "Fats & Oils",
		items: [
			{ label: "Butter", key: "butter" },
			{ label: "Vegetable oil", key: "vegetable oil" },
			{ label: "Olive oil", key: "olive oil" },
			{ label: "Coconut oil", key: "coconut oil" },
			{ label: "Ghee", key: "ghee" },
			{ label: "Shortening", key: "shortening" },
			{ label: "Lard", key: "lard" },
			{ label: "Margarine", key: "margarine" },
			{ label: "Peanut butter", key: "peanut butter" },
			{ label: "Mayonnaise", key: "mayonnaise" },
			{ label: "Almond butter", key: "almond butter" },
			{ label: "Tahini", key: "tahini" },
		],
	},
	{
		category: "Liquids",
		items: [
			{ label: "Water", key: "water" },
			{ label: "Milk (whole)", key: "milk" },
			{ label: "Cream", key: "cream" },
			{ label: "Buttermilk", key: "buttermilk" },
			{ label: "Sour cream", key: "sour cream" },
			{ label: "Yogurt", key: "yogurt" },
			{ label: "Greek yogurt", key: "greek yogurt" },
			{ label: "Coconut milk", key: "coconut milk" },
			{ label: "Oat milk", key: "oat milk" },
			{ label: "Almond milk", key: "almond milk" },
			{ label: "Chicken stock", key: "chicken stock" },
			{ label: "Vegetable stock", key: "vegetable stock" },
			{ label: "Lemon juice", key: "lemon juice" },
			{ label: "Orange juice", key: "orange juice" },
			{ label: "Soy sauce", key: "soy sauce" },
			{ label: "Sweetened condensed milk", key: "sweetened condensed milk" },
			{ label: "Evaporated milk", key: "evaporated milk" },
		],
	},
	{
		category: "Leavening & Dry Goods",
		items: [
			{ label: "Baking powder", key: "baking powder" },
			{ label: "Baking soda", key: "baking soda" },
			{ label: "Salt (table)", key: "salt" },
			{ label: "Kosher salt (Morton)", key: "morton kosher salt" },
			{
				label: "Kosher salt (Diamond Crystal)",
				key: "diamond crystal kosher salt",
			},
			{ label: "Cocoa powder", key: "cocoa powder" },
			{ label: "Cacao powder", key: "cacao powder" },
			{ label: "Vanilla extract", key: "vanilla extract" },
			{ label: "Instant yeast", key: "instant yeast" },
			{ label: "Active dry yeast", key: "active dry yeast" },
		],
	},
	{
		category: "Grains",
		items: [
			{ label: "White rice", key: "rice" },
			{ label: "Rolled oats", key: "rolled oats" },
			{ label: "Quinoa", key: "quinoa" },
			{ label: "Couscous", key: "couscous" },
			{ label: "Polenta / cornmeal", key: "polenta" },
			{ label: "Breadcrumbs", key: "breadcrumbs" },
			{ label: "Panko", key: "panko" },
		],
	},
	{
		category: "Chocolate, Nuts & Seeds",
		items: [
			{ label: "Chocolate chips", key: "chocolate chips" },
			{ label: "Mixed nuts", key: "nuts" },
			{ label: "Ground almonds", key: "ground almonds" },
			{ label: "Walnuts (chopped)", key: "walnuts chopped" },
			{ label: "Pecans (chopped)", key: "pecans chopped" },
			{ label: "Cashews", key: "cashews" },
			{ label: "Peanuts", key: "peanuts" },
			{ label: "Hazelnuts", key: "hazelnuts" },
			{ label: "Pistachios", key: "pistachios" },
		],
	},
	{
		category: "Cheese & Dairy",
		items: [
			{ label: "Cream cheese", key: "cream cheese" },
			{ label: "Ricotta", key: "ricotta" },
			{ label: "Mascarpone", key: "mascarpone" },
			{ label: "Parmesan (grated)", key: "parmesan grated" },
			{ label: "Cheddar (grated)", key: "cheddar cheese grated" },
			{ label: "Cottage cheese", key: "cottage cheese" },
		],
	},
	{
		category: "Herbs & Spices (ground)",
		items: [
			{ label: "Cinnamon", key: "cinnamon" },
			{ label: "Ginger powder", key: "ground ginger" },
			{ label: "Nutmeg", key: "nutmeg" },
			{ label: "Paprika", key: "paprika" },
			{ label: "Cumin", key: "cumin" },
			{ label: "Turmeric", key: "turmeric" },
			{ label: "Garlic powder", key: "garlic powder" },
			{ label: "Onion powder", key: "onion powder" },
		],
	},
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COMBOBOX_INGREDIENTS: ComboboxIngredient[] =
	INGREDIENT_CATEGORIES.flatMap((cat) =>
		cat.items.map((item) => ({ ...item, category: cat.category })),
	);

function UnitOptions() {
	return (
		<>
			{TOOL_UNIT_GROUPS.map((group) => (
				<optgroup key={group} label={group}>
					{TOOL_UNITS.filter((u) => u.group === group).map((u) => (
						<option key={u.id} value={u.id}>
							{u.label}
						</option>
					))}
				</optgroup>
			))}
		</>
	);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UnitConverterForm() {
	const [quantity, setQuantity] = useState<string>("1");
	const [fromUnit, setFromUnit] = useState<string>("cup");
	const [toUnit, setToUnit] = useState<string>("g");
	const [ingredientKey, setIngredientKey] =
		useState<string>("all purpose flour");

	const parsedInput = parseQuantityInput(quantity);
	const parsedQty = parsedInput.ok ? parsedInput.value : null;
	const inputError = parsedInput.ok
		? null
		: quantityInputErrorMessage(parsedInput.reason);

	const conversion = useMemo(() => {
		if (parsedQty === null) {
			return { result: null, error: null, needsIngredient: false };
		}
		if (fromUnit === toUnit) {
			return { result: parsedQty, error: null, needsIngredient: false };
		}

		const cross = isCrossKind(fromUnit, toUnit);
		const density = ingredientKey ? lookupDensity(ingredientKey) : null;

		if (cross && !ingredientKey) {
			return { result: null, error: null, needsIngredient: true };
		}
		if (cross && !density) {
			return {
				result: null,
				error:
					"Density not found for this ingredient. Select a different ingredient or convert within the same unit family.",
				needsIngredient: false,
			};
		}

		const r = convertToolUnits(parsedQty, fromUnit, toUnit, density);
		if (r === null) {
			return {
				result: null,
				error: "These units cannot be converted directly.",
				needsIngredient: false,
			};
		}
		return { result: r, error: null, needsIngredient: false };
	}, [parsedQty, fromUnit, toUnit, ingredientKey]);

	const selectedIngredientLabel = useMemo(() => {
		if (!ingredientKey) return null;
		for (const cat of INGREDIENT_CATEGORIES) {
			const found = cat.items.find((i) => i.key === ingredientKey);
			if (found) return found.label;
		}
		return null;
	}, [ingredientKey]);

	const cross = isCrossKind(fromUnit, toUnit);

	return (
		<div className="space-y-8">
			{/* Converter form */}
			<div className="glass-panel relative z-30 rounded-2xl p-6 md:p-8">
				<div className="flex flex-col gap-6 md:flex-row md:items-stretch md:gap-8">
					{/* Left column: Amount + From */}
					<div className="flex min-w-0 flex-1 flex-col gap-4">
						<div>
							<label
								htmlFor="conv-qty"
								className="text-label text-muted mb-1 block"
							>
								Amount
							</label>
							<input
								id="conv-qty"
								type="text"
								inputMode="decimal"
								autoComplete="off"
								spellCheck={false}
								placeholder="e.g. 1, 1.5, 1/2 or 1 ½"
								value={quantity}
								onChange={(e) => setQuantity(e.target.value)}
								aria-label="Quantity to convert"
								aria-invalid={inputError !== null}
								aria-describedby={inputError ? "conv-qty-error" : undefined}
								className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon font-mono text-lg focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							/>
							{inputError && (
								<p
									id="conv-qty-error"
									role="alert"
									className="mt-2 text-sm text-warning"
								>
									{inputError}
								</p>
							)}
						</div>
						<div>
							<label
								htmlFor="conv-from"
								className="text-label text-muted mb-1 block"
							>
								From
							</label>
							<select
								id="conv-from"
								value={fromUnit}
								onChange={(e) => setFromUnit(e.target.value)}
								aria-label="Convert from unit"
								className="w-full appearance-none rounded-lg bg-platinum px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							>
								<UnitOptions />
							</select>
						</div>
					</div>

					{/* Center: arrow */}
					<div
						aria-hidden
						className="flex items-center justify-center py-2 md:py-0"
					>
						<span className="text-hyper-green font-bold text-2xl select-none">
							<span className="md:hidden">↓</span>
							<span className="hidden md:inline">→</span>
						</span>
					</div>

					{/* Right column: Result + To */}
					<div className="flex min-w-0 flex-1 flex-col gap-4">
						<div>
							<div className="text-label text-muted mb-1 block">Result</div>
							<div
								aria-live="polite"
								aria-atomic="true"
								className="flex min-h-[48px] w-full items-center rounded-lg bg-platinum px-4 py-3 font-mono text-lg text-carbon"
							>
								{conversion.result !== null ? (
									<span className="text-hyper-green font-bold">
										{formatConversionResult(conversion.result)}
									</span>
								) : conversion.needsIngredient ? (
									<span className="text-muted text-sm">
										Select ingredient ↓
									</span>
								) : (
									<span className="text-muted/50">—</span>
								)}
							</div>
						</div>
						<div>
							<label
								htmlFor="conv-to"
								className="text-label text-muted mb-1 block"
							>
								To
							</label>
							<select
								id="conv-to"
								value={toUnit}
								onChange={(e) => setToUnit(e.target.value)}
								aria-label="Convert to unit"
								className="w-full appearance-none rounded-lg bg-platinum px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							>
								<UnitOptions />
							</select>
						</div>
					</div>
				</div>

				{/* Ingredient dropdown — shown when weight↔volume, always available for context */}
				<div className={`mt-6 ${cross ? "opacity-100" : "opacity-60"}`}>
					<IngredientCombobox
						ingredients={COMBOBOX_INGREDIENTS}
						value={ingredientKey}
						onChange={setIngredientKey}
						required={cross}
						label={
							<>
								Ingredient{" "}
								{cross && (
									<span className="font-normal text-muted">
										(required for weight ↔ volume)
									</span>
								)}
							</>
						}
					/>
				</div>

				{/* Result summary banner */}
				{conversion.result !== null && fromUnit !== toUnit && (
					<div className="mt-6 p-4 rounded-xl bg-hyper-green/10 border border-hyper-green/20 font-mono text-sm text-carbon">
						<span className="font-bold">
							{parsedQty !== null
								? formatConversionResult(parsedQty)
								: quantity}{" "}
							{getToolUnit(fromUnit)?.symbol ?? fromUnit}
						</span>{" "}
						{selectedIngredientLabel ? (
							<span className="text-muted">of {selectedIngredientLabel} </span>
						) : null}
						<span className="text-muted">= </span>
						<span className="font-bold text-hyper-green">
							{formatConversionResult(conversion.result)}{" "}
							{getToolUnit(toUnit)?.symbol ?? toUnit}
						</span>
					</div>
				)}

				{conversion.result !== null && fromUnit !== toUnit && (
					<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-sm text-muted leading-relaxed">
							Converting a whole Meal? Ration does this automatically as you add
							ingredients, and scales servings too.
						</p>
						<Link
							to="/"
							className="inline-block shrink-0 text-center px-5 py-2.5 bg-hyper-green text-on-hyper-green font-bold text-xs uppercase tracking-wider rounded-lg hover:shadow-glow transition-shadow"
						>
							Try Ration free
						</Link>
					</div>
				)}

				{/* Error */}
				{conversion.error && (
					<div className="mt-6 p-4 rounded-xl bg-warning/10 border border-warning/20 text-sm text-carbon">
						{conversion.error}
					</div>
				)}

				{/* Cross-family hint when no ingredient selected */}
				{cross && !ingredientKey && !conversion.error && (
					<p className="mt-3 text-sm text-muted">
						Select an ingredient above for accurate weight↔volume conversion.
					</p>
				)}
			</div>
		</div>
	);
}
