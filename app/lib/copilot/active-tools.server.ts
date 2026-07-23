/**
 * Intent-scoped Copilot activeTools — shrink the tool surface per turn.
 * Always include core read/context tools; add domain writes by keyword match.
 */

const CORE_TOOLS = [
	"search_docs",
	"get_context",
	"get_kitchen_summary",
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
		/\bactive meals?\b/,
		/\bgenerate\b/,
	]);
	const wantManifest = includesAny(text, [
		/\bmanifest\b/,
		/\bmeal plan\b/,
		/\bplan week\b/,
		/\bschedule\b/,
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

	const addGroup = (group: readonly string[]) => {
		for (const name of group) {
			if (available.has(name)) selected.add(name);
		}
	};

	if (wantInventory) addGroup(INVENTORY_WRITE);
	if (wantGalley) addGroup(GALLEY_WRITE);
	if (wantManifest) addGroup(MANIFEST_WRITE);
	if (wantSupply) addGroup(SUPPLY_WRITE);
	if (wantPrefs) addGroup(PREFERENCES_WRITE);

	// No write-domain match: keep core reads only (plus any already selected).
	// If the user asked something that needs writes but keywords missed, they can
	// rephrase; broad "help with kitchen" still has summary/read tools.
	const result = availableToolNames.filter((name) => selected.has(name));
	// Safety: never return empty when tools exist.
	return result.length > 0 ? result : availableToolNames;
}
