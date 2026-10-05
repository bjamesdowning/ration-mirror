/** Discrete units a Home Screen Ate button may eat as one step. Dozen is excluded. */
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
export const WIDGET_ATE_LIMIT = 4;
const WIDGET_NAME_MAX = 48;

export type WidgetAteAction = "eat" | "open";

export type HomeWidgetSupplyItem = {
	id: string;
	name: string;
};

export type HomeWidgetAteFood = {
	cargoId: string;
	name: string;
	action: WidgetAteAction;
	stepQuantity: number;
	unit: string;
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
export function widgetAteAction(unit: string): WidgetAteAction {
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

export function selectAteFoods(
	rows: Array<{ id: string; name: string; unit: string }>,
	limit = WIDGET_ATE_LIMIT,
): HomeWidgetAteFood[] {
	const seen = new Set<string>();
	const eat: HomeWidgetAteFood[] = [];
	const open: HomeWidgetAteFood[] = [];
	for (const row of rows) {
		if (!row.id || seen.has(row.id)) continue;
		seen.add(row.id);
		const name = clipWidgetName(row.name);
		if (!name) continue;
		const unit = row.unit.trim().toLowerCase() || "unit";
		const food: HomeWidgetAteFood = {
			cargoId: row.id,
			name,
			action: widgetAteAction(unit),
			stepQuantity: 1,
			unit,
		};
		if (food.action === "eat") eat.push(food);
		else open.push(food);
	}
	return [...eat, ...open].slice(0, limit);
}

export function selectNextMeal(
	rows: Array<{
		name: string;
		slotType: string;
		orderIndex: number;
		cooked: boolean;
	}>,
): { status: HomeWidgetMealStatus; title: string | null } {
	const named = rows
		.map((row) => ({ ...row, name: clipWidgetName(row.name) }))
		.filter((row) => row.name.length > 0);
	if (named.length === 0) return { status: "clear", title: null };
	const uncooked = named
		.filter((row) => !row.cooked)
		.sort((a, b) => {
			const rank = (SLOT_RANK[a.slotType] ?? 9) - (SLOT_RANK[b.slotType] ?? 9);
			if (rank !== 0) return rank;
			return a.orderIndex - b.orderIndex;
		});
	const next = uncooked[0];
	if (!next) return { status: "done", title: null };
	return { status: "planned", title: next.name };
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
