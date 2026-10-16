/** Discrete units a Home Screen Eat button may eat as one step. Dozen is excluded. */
const WIDGET_EAT_STEP_UNITS = new Set([
	"unit",
	"piece",
	"bunch",
	"clove",
	"slice",
	"head",
	"stalk",
	"sprig",
	"can",
	"pack",
]);

export const WIDGET_SUPPLY_LIMIT = 5;
export const WIDGET_EAT_LIMIT = 4;
export const WIDGET_TODAY_MEAL_LIMIT = 8;
const WIDGET_NAME_MAX = 48;

export type WidgetEatAction = "eat" | "open";

export type HomeWidgetSupplyItem = {
	id: string;
	name: string;
};

export type HomeWidgetEatFood = {
	cargoId: string;
	name: string;
	action: WidgetEatAction;
	stepQuantity: number;
	unit: string;
	quantity: number;
};

export type HomeWidgetTagChoice = {
	slug: string;
	name: string;
};

export type HomeWidgetMeal = {
	name: string;
	slotType: string;
	cooked: boolean;
};

export type HomeWidgetMacro = {
	remaining: number;
	goal: number;
};

export type HomeWidgetMealStatus = "clear" | "planned" | "done";

export type HomeWidgetEnergy = {
	remainingKcal: number;
	goalKcal: number;
};

const SLOT_RANK: Record<string, number> = {
	breakfast: 0,
	lunch: 1,
	dinner: 2,
	snack: 3,
};

export function clipWidgetName(raw: string): string {
	const trimmed = raw.replace(/\s+/g, " ").trim();
	if (trimmed.length <= WIDGET_NAME_MAX) return trimmed;
	return `${trimmed.slice(0, WIDGET_NAME_MAX - 1).trimEnd()}…`;
}

/** One-tap eat is only for a single discrete count. Weight, volume, and dozen open the sheet. */
export function widgetEatAction(unit: string): WidgetEatAction {
	const normalized = unit.trim().toLowerCase();
	return WIDGET_EAT_STEP_UNITS.has(normalized) ? "eat" : "open";
}

export function selectSupplyPreview(
	items: Array<{ id: string; name: string }>,
	limit = WIDGET_SUPPLY_LIMIT,
): HomeWidgetSupplyItem[] {
	const preview: HomeWidgetSupplyItem[] = [];
	for (const item of items) {
		const name = clipWidgetName(item.name);
		if (!item.id || !name) continue;
		preview.push({ id: item.id, name });
		if (preview.length >= limit) break;
	}
	return preview;
}

export function selectEatFoods(
	rows: Array<{ id: string; name: string; unit: string; quantity?: number }>,
	limit = WIDGET_EAT_LIMIT,
): HomeWidgetEatFood[] {
	const seen = new Set<string>();
	const eat: HomeWidgetEatFood[] = [];
	const open: HomeWidgetEatFood[] = [];
	for (const row of rows) {
		if (!row.id || seen.has(row.id)) continue;
		seen.add(row.id);
		const name = clipWidgetName(row.name);
		if (!name) continue;
		const unit = row.unit.trim().toLowerCase() || "unit";
		const quantity = Number(row.quantity);
		const food: HomeWidgetEatFood = {
			cargoId: row.id,
			name,
			action: widgetEatAction(unit),
			stepQuantity: 1,
			unit,
			quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
		};
		if (food.action === "eat") eat.push(food);
		else open.push(food);
	}
	return [...eat, ...open].slice(0, limit);
}

function namedMeals(
	rows: Array<{
		name: string;
		slotType: string;
		orderIndex: number;
		cooked: boolean;
	}>,
) {
	return rows
		.map((row) => ({ ...row, name: clipWidgetName(row.name) }))
		.filter((row) => row.name.length > 0)
		.sort((a, b) => {
			const rank = (SLOT_RANK[a.slotType] ?? 9) - (SLOT_RANK[b.slotType] ?? 9);
			if (rank !== 0) return rank;
			return a.orderIndex - b.orderIndex;
		});
}

export function selectTodayMeals(
	rows: Array<{
		name: string;
		slotType: string;
		orderIndex: number;
		cooked: boolean;
	}>,
	limit = WIDGET_TODAY_MEAL_LIMIT,
): HomeWidgetMeal[] {
	return namedMeals(rows)
		.slice(0, limit)
		.map((row) => ({
			name: row.name,
			slotType: row.slotType,
			cooked: row.cooked,
		}));
}

export function selectNextMeal(
	rows: Array<{
		name: string;
		slotType: string;
		orderIndex: number;
		cooked: boolean;
	}>,
): {
	status: HomeWidgetMealStatus;
	title: string | null;
	slotType: string | null;
} {
	const named = namedMeals(rows);
	if (named.length === 0)
		return { status: "clear", title: null, slotType: null };
	const next = named.find((row) => !row.cooked);
	if (!next) return { status: "done", title: null, slotType: null };
	return { status: "planned", title: next.name, slotType: next.slotType };
}

/** Signed remaining energy. Null when the person has no positive goal. */
export function energyGlance(
	goalKcal: number | null,
	consumedKcal: number,
): HomeWidgetEnergy | null {
	if (goalKcal == null || !Number.isFinite(goalKcal) || goalKcal <= 0) {
		return null;
	}
	if (!Number.isFinite(consumedKcal) || consumedKcal < 0) return null;
	return {
		remainingKcal: Math.round(goalKcal - consumedKcal),
		goalKcal: Math.round(goalKcal),
	};
}

/** Signed remaining grams. Null when that macro has no positive goal. */
export function macroGlance(
	goal: number | null,
	consumed: number,
): HomeWidgetMacro | null {
	if (goal == null || !Number.isFinite(goal) || goal <= 0) return null;
	if (!Number.isFinite(consumed) || consumed < 0) return null;
	return {
		remaining: Math.round(goal - consumed),
		goal: Math.round(goal),
	};
}
