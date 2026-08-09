/**
 * Intent-scoped Copilot activeTools — shrink the tool surface per turn.
 * Always include core read/context tools; add domain writes by keyword match.
 */

const CORE_TOOLS = [
	"search_docs",
	"get_context",
	"get_kitchen_summary",
	"get_kitchen_events",
	"get_kitchen_stats",
	"get_billing_summary",
	"get_user_preferences",
	"search_ingredients",
	"list_inventory",
	"get_cargo_item",
	"get_expiring_items",
	"get_expired_items",
	"list_meals",
	"match_meals",
	"get_meal_plan",
	"get_supply_list",
	// High-frequency agentic writes — always available to avoid keyword misses.
	"create_meal",
	"propose_manifest_plan",
] as const;

const INVENTORY_WRITE = [
	"add_cargo_item",
	"update_cargo_item",
	"adjust_cargo_item",
	"remove_cargo_item",
	"preview_inventory_import",
	"apply_inventory_import",
	"preview_inventory_remove",
	"apply_inventory_remove",
	"import_inventory_csv",
] as const;

const GALLEY_WRITE = [
	"create_meal",
	"update_meal",
	"delete_meal",
	"set_active_meals",
	"clear_active_meals",
	"consume_meal",
	"start_generate_meal",
] as const;

const MANIFEST_WRITE = [
	"propose_manifest_plan",
	"commit_manifest_plan",
	"add_meal_plan_entry",
	"update_meal_plan_entry",
	"remove_meal_plan_entry",
	"consume_manifest_entries",
	"start_plan_week",
] as const;

const SUPPLY_WRITE = [
	"add_supply_item",
	"update_supply_item",
	"remove_supply_item",
	"mark_supply_purchased_bulk",
	"sync_supply_from_selected_meals",
	"complete_supply_list",
] as const;

const PREFERENCES_WRITE = ["update_user_preferences"] as const;

const NUTRITION_TOOLS = [
	"get_nutrition_summary",
	"set_nutrition_goal",
	"clear_nutrition_goal",
	"consume_manifest_entries",
] as const;

function includesAny(text: string, needles: RegExp[]): boolean {
	return needles.some((needle) => needle.test(text));
}

/**
 * Filter available tool names for this turn based on the latest user text.
 * Unknown / empty text keeps the full available set (safe default).
 */
export function resolveCopilotActiveTools(
	availableToolNames: string[],
	userText: string,
): string[] {
	const available = new Set(availableToolNames);
	const text = userText.trim().toLowerCase();
	if (!text) {
		return availableToolNames;
	}

	const selected = new Set<string>();
	for (const name of CORE_TOOLS) {
		if (available.has(name)) selected.add(name);
	}

	const wantInventory = includesAny(text, [
		/\bcargo\b/,
		/\bpantry\b/,
		/\binventory\b/,
		/\bingredient/,
		/\badd\b/,
		/\bremove\b/,
		/\bdelete\b/,
		/\bjettison\b/,
		/\bimport\b/,
		/\breceipt\b/,
		/\bstock\b/,
		/\bstock up\b/,
		/\bfill\b/,
		/\brestock\b/,
		/\bfresh\b/,
		/\bquantity\b/,
		/\bexpired?\b/,
		/\bexpir/,
		/\bate\b/,
		/\bused\b/,
	]);
	const wantGalley = includesAny(text, [
		/\bmeal\b/,
		/\brecipe\b/,
		/\bgalley\b/,
		/\bcook\b/,
		/\bdish\b/,
		/\bcuisine\b/,
		/\bdinner idea\b/,
		/\bactive meals?\b/,
		/\bgenerate\b/,
	]);
	const wantManifest = includesAny(text, [
		/\bmanifest\b/,
		/\bmeal plan\b/,
		/\bplan week\b/,
		/\bschedule\b/,
		/\bweek of\b/,
		/\bnightly\b/,
		/\bweekly\b/,
		/\bdinner\b/,
		/\bbreakfast\b/,
		/\blunch\b/,
		/\bslot\b/,
	]);
	const wantSupply = includesAny(text, [
		/\bsupply\b/,
		/\bshopping\b/,
		/\bgrocery\b/,
		/\bpurchased\b/,
		/\bbought\b/,
		/\brestock\b/,
	]);
	const wantPrefs = includesAny(text, [
		/\bpreference/,
		/\ballergen/,
		/\bdiet\b/,
		/\bunit mode\b/,
		/\bsettings\b/,
	]);
	const wantNutrition = includesAny(text, [
		/\bcalorie/,
		/\bkcal\b/,
		/\bmacro/,
		/\bnutrition/,
		/\bgoal\b/,
		/\bate\b/,
		/\bconsumed\b/,
		/\bprotein\b/,
		/\bintake\b/,
	]);

	const addGroup = (group: readonly string[]) => {
		for (const name of group) {
			if (available.has(name)) selected.add(name);
		}
	};

	const matchedDomains = [
		wantInventory,
		wantGalley,
		wantManifest,
		wantSupply,
		wantPrefs,
		wantNutrition,
	].filter(Boolean).length;

	// Multi-part requests (e.g. "create meal plan and fill inventory"): open all writes.
	if (matchedDomains >= 2) {
		addGroup(INVENTORY_WRITE);
		addGroup(GALLEY_WRITE);
		addGroup(MANIFEST_WRITE);
		addGroup(SUPPLY_WRITE);
		addGroup(PREFERENCES_WRITE);
		addGroup(NUTRITION_TOOLS);
	} else {
		if (wantInventory) addGroup(INVENTORY_WRITE);
		if (wantGalley) addGroup(GALLEY_WRITE);
		if (wantManifest) addGroup(MANIFEST_WRITE);
		if (wantSupply) addGroup(SUPPLY_WRITE);
		if (wantPrefs) addGroup(PREFERENCES_WRITE);
		if (wantNutrition) addGroup(NUTRITION_TOOLS);
	}

	// No write-domain match: keep core reads only (plus any already selected).
	// If the user asked something that needs writes but keywords missed, they can
	// rephrase; broad "help with kitchen" still has summary/read tools.
	const result = availableToolNames.filter((name) => selected.has(name));
	// Safety: never return empty when tools exist.
	return result.length > 0 ? result : availableToolNames;
}
