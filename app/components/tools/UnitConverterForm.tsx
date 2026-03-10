import { useMemo, useState } from "react";
import { lookupDensity } from "~/lib/ingredient-density";
import {
	convertQuantity,
	convertQuantityWithDensity,
	getUnitFamily,
	type SupportedUnit,
} from "~/lib/units";

// ─── Cooking-relevant unit groups ─────────────────────────────────────────────

const VOLUME_UNITS: SupportedUnit[] = [
	"tsp",
	"tbsp",
	"fl oz",
	"cup",
	"pt",
	"qt",
	"gal",
	"ml",
	"l",
];
const WEIGHT_UNITS: SupportedUnit[] = ["g", "kg", "oz", "lb"];
const UNIT_LABELS: Record<string, string> = {
	tsp: "tsp (teaspoon)",
	tbsp: "tbsp (tablespoon)",
	"fl oz": "fl oz (fluid ounce)",
	cup: "cup",
	pt: "pt (pint)",
	qt: "qt (quart)",
	gal: "gal (gallon)",
	ml: "ml (milliliter)",
	l: "l (liter)",
	g: "g (gram)",
	kg: "kg (kilogram)",
	oz: "oz (ounce)",
	lb: "lb (pound)",
};

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
		],
	},
	{
		category: "Leavening & Dry Goods",
		items: [
			{ label: "Baking powder", key: "baking powder" },
			{ label: "Baking soda", key: "baking soda" },
			{ label: "Salt (table)", key: "salt" },
			{ label: "Kosher salt", key: "kosher salt" },
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

function formatResult(value: number): string {
	if (!Number.isFinite(value) || value < 0) return "—";
	if (value === 0) return "0";
	// Round to 4 significant figures then strip trailing zeros
	const parsed = parseFloat(value.toPrecision(4));
	return parsed.toString();
}

function isWeightUnit(u: SupportedUnit): boolean {
	const f = getUnitFamily(u);
	return f === "weight_metric" || f === "weight_imperial";
}

function isVolumeUnit(u: SupportedUnit): boolean {
	return getUnitFamily(u) === "volume";
}

function isCrossFamily(from: SupportedUnit, to: SupportedUnit): boolean {
	return (
		(isWeightUnit(from) && isVolumeUnit(to)) ||
		(isVolumeUnit(from) && isWeightUnit(to))
	);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UnitConverterForm() {
	const [quantity, setQuantity] = useState<string>("1");
	const [fromUnit, setFromUnit] = useState<SupportedUnit>("cup");
	const [toUnit, setToUnit] = useState<SupportedUnit>("g");
	const [ingredientKey, setIngredientKey] = useState<string>("");

	const parsedQty = parseFloat(quantity);

	const conversion = useMemo(() => {
		if (!Number.isFinite(parsedQty) || parsedQty < 0) {
			return { result: null, error: null, needsIngredient: false };
		}
		if (fromUnit === toUnit) {
			return { result: parsedQty, error: null, needsIngredient: false };
		}

		const cross = isCrossFamily(fromUnit, toUnit);

		if (!cross) {
			const r = convertQuantity(parsedQty, fromUnit, toUnit);
			if (r === null) {
				return {
					result: null,
					error:
						"These units cannot be converted directly. Try selecting an ingredient to enable weight↔volume conversion.",
					needsIngredient: false,
				};
			}
			return { result: r, error: null, needsIngredient: false };
		}

		// Cross-family: need ingredient density
		if (!ingredientKey) {
			return {
				result: null,
				error: null,
				needsIngredient: true,
			};
		}

		const density = lookupDensity(ingredientKey);
		if (!density) {
			return {
				result: null,
				error:
					"Density not found for this ingredient. Select a different ingredient or convert within the same unit family.",
				needsIngredient: false,
			};
		}

		const r = convertQuantityWithDensity(parsedQty, fromUnit, toUnit, density);
		if (r === null) {
			return {
				result: null,
				error:
					"Conversion failed. Check that both units are in supported families.",
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

	const cross = isCrossFamily(fromUnit, toUnit);

	return (
		<div className="space-y-8">
			{/* Converter form */}
			<div className="glass-panel rounded-2xl p-6 md:p-8">
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
								type="number"
								inputMode="decimal"
								value={quantity}
								min="0"
								step="any"
								onChange={(e) => setQuantity(e.target.value)}
								aria-label="Quantity to convert"
								className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon font-mono text-lg focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							/>
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
								onChange={(e) => setFromUnit(e.target.value as SupportedUnit)}
								aria-label="Convert from unit"
								className="w-full appearance-none rounded-lg bg-platinum px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							>
								<optgroup label="Volume">
									{VOLUME_UNITS.map((u) => (
										<option key={u} value={u}>
											{UNIT_LABELS[u] ?? u}
										</option>
									))}
								</optgroup>
								<optgroup label="Weight">
									{WEIGHT_UNITS.map((u) => (
										<option key={u} value={u}>
											{UNIT_LABELS[u] ?? u}
										</option>
									))}
								</optgroup>
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
										{formatResult(conversion.result)}
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
								onChange={(e) => setToUnit(e.target.value as SupportedUnit)}
								aria-label="Convert to unit"
								className="w-full appearance-none rounded-lg bg-platinum px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							>
								<optgroup label="Volume">
									{VOLUME_UNITS.map((u) => (
										<option key={u} value={u}>
											{UNIT_LABELS[u] ?? u}
										</option>
									))}
								</optgroup>
								<optgroup label="Weight">
									{WEIGHT_UNITS.map((u) => (
										<option key={u} value={u}>
											{UNIT_LABELS[u] ?? u}
										</option>
									))}
								</optgroup>
							</select>
						</div>
					</div>
				</div>

				{/* Ingredient dropdown — shown when weight↔volume, always available for context */}
				<div className={`mt-6 ${cross ? "opacity-100" : "opacity-60"}`}>
					<label
						htmlFor="conv-ingredient"
						className="text-label text-muted mb-1 block"
					>
						Ingredient{" "}
						{cross && (
							<span className="font-normal text-muted">
								(required for weight ↔ volume)
							</span>
						)}
					</label>
					<select
						id="conv-ingredient"
						value={ingredientKey || ""}
						onChange={(e) => setIngredientKey(e.target.value)}
						aria-label="Select ingredient for density-based conversion"
						aria-required={cross}
						className="w-full appearance-none rounded-lg bg-platinum px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
					>
						<option value="">Select ingredient…</option>
						{INGREDIENT_CATEGORIES.map((cat) => (
							<optgroup key={cat.category} label={cat.category}>
								{cat.items.map((item) => (
									<option key={item.key} value={item.key}>
										{item.label}
									</option>
								))}
							</optgroup>
						))}
					</select>
				</div>

				{/* Result summary banner */}
				{conversion.result !== null && fromUnit !== toUnit && (
					<div className="mt-6 p-4 rounded-xl bg-hyper-green/10 border border-hyper-green/20 font-mono text-sm text-carbon">
						<span className="font-bold">
							{quantity} {fromUnit}
						</span>{" "}
						{selectedIngredientLabel ? (
							<span className="text-muted">of {selectedIngredientLabel} </span>
						) : null}
						<span className="text-muted">= </span>
						<span className="font-bold text-hyper-green">
							{formatResult(conversion.result)} {toUnit}
						</span>
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
