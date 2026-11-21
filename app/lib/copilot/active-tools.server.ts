/**
 * Intent-scoped Copilot activeTools — shrink the tool surface per turn.
 * Always include core read/context tools; add domain writes by keyword match.
 */

export const CORE_TOOLS = [
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
	"get_meal",
	"match_meals",
	"get_meal_plan",
	"get_supply_list",
	"list_supply_lists",
	// High-frequency agentic writes — always available to avoid keyword misses.
	"create_meal",
	"propose_manifest_plan",
] as const;

export const INVENTORY_WRITE = [
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

export const GALLEY_WRITE = [
	"create_meal",
	"update_meal",
	"delete_meal",
	"set_active_meals",
	"clear_active_meals",
	"consume_meal",
] as const;

export const MANIFEST_WRITE = [
	"propose_manifest_plan",
	"commit_manifest_plan",
	"add_meal_plan_entry",
	"update_meal_plan_entry",
	"remove_meal_plan_entry",
	"cook_manifest_entries",
	"consume_manifest_entries",
] as const;

export const SUPPLY_WRITE = [
	"add_supply_item",
	"update_supply_item",
	"remove_supply_item",
	"mark_supply_purchased_bulk",
	"sync_supply_from_selected_meals",
	"complete_supply_list",
	"create_supply_list",
	"duplicate_supply_list",
	"archive_supply_list",
	"transfer_supply_items",
	"manage_supply_staples",
	"save_receipt_as_supply_list",
] as const;

export const PREFERENCES_WRITE = ["update_user_preferences"] as const;

export const NUTRITION_TOOLS = [
	"get_nutrition_summary",
	"list_nutrition_intakes",
	"set_nutrition_goal",
	"clear_nutrition_goal",
	"log_manifest_intake",
	"clear_manifest_intake",
	"log_diary_food",
	"update_diary_food",
	"void_diary_food",
	"save_diary_food_to_kitchen",
	"quote_food_log",
	"list_saved_foods",
	"save_food",
	"delete_saved_food",
	"cook_manifest_entries",
	"consume_manifest_entries",
	"quick_eat_cargo",
] as const;

function includesAny(text: string, needles: RegExp[]): boolean {
	return needles.some((needle) => needle.test(text));
}

/** Write domains that stay open for a short time after a preview tool ran. */
export type CopilotWriteCarryForwardDomain = "inventory" | "manifest";

/** Matches the 15-minute preview token TTL in mcp/tools/inventory.ts. */
export const COPILOT_WRITE_CARRY_FORWARD_MS = 15 * 60 * 1000;

export type CopilotWriteCarryForwardEntry = {
	domain: CopilotWriteCarryForwardDomain;
	expiresAt: number;
};

/** Preview tools that open a carry-forward domain when they succeed. */
export const COPILOT_CARRY_FORWARD_PREVIEW_TOOLS: Record<
	string,
	CopilotWriteCarryForwardDomain
> = {
	preview_inventory_remove: "inventory",
	preview_inventory_import: "inventory",
	propose_manifest_plan: "manifest",
};

/** Commit tools that close their carry-forward domain when they succeed. */
export const COPILOT_CARRY_FORWARD_COMMIT_TOOLS: Record<
	string,
	CopilotWriteCarryForwardDomain
> = {
	apply_inventory_remove: "inventory",
	apply_inventory_import: "inventory",
	commit_manifest_plan: "manifest",
};

/** Live (unexpired) carry-forward domains at `now`. */
export function liveCarryForwardDomains(
	entries: readonly CopilotWriteCarryForwardEntry[] | undefined,
	now: number,
): CopilotWriteCarryForwardDomain[] {
	if (!entries) return [];
	const domains = new Set<CopilotWriteCarryForwardDomain>();
	for (const entry of entries) {
		if (entry.expiresAt > now) domains.add(entry.domain);
	}
	return [...domains];
}

/**
 * Next carry-forward list after a tool finished. A successful preview opens
 * (or refreshes) its domain for 15 minutes. A successful commit closes it.
 * Expired entries are dropped. Returns the same array when nothing changed.
 */
export function nextCarryForwardEntries(
	entries: readonly CopilotWriteCarryForwardEntry[],
	toolName: string,
	succeeded: boolean,
	now: number,
): CopilotWriteCarryForwardEntry[] {
	const live = entries.filter((entry) => entry.expiresAt > now);
	if (!succeeded) {
		return live.length === entries.length ? [...entries] : live;
	}
	const opened = COPILOT_CARRY_FORWARD_PREVIEW_TOOLS[toolName];
	if (opened) {
		return [
			...live.filter((entry) => entry.domain !== opened),
			{ domain: opened, expiresAt: now + COPILOT_WRITE_CARRY_FORWARD_MS },
		];
	}
	const closed = COPILOT_CARRY_FORWARD_COMMIT_TOOLS[toolName];
	if (closed) {
		return live.filter((entry) => entry.domain !== closed);
	}
	return live.length === entries.length ? [...entries] : live;
}

export type ResolveCopilotActiveToolsOptions = {
	/** Live carry-forward domains (flag `copilot-confirm-scope`). */
	carryForward?: readonly CopilotWriteCarryForwardDomain[];
	/** Extra delete word forms (flag `copilot-confirm-scope`). */
	wordForms?: boolean;
};

/** Delete phrasing beyond `remove` / `delete` (flag `copilot-confirm-scope`). */
const INVENTORY_DELETE_WORD_FORMS: RegExp[] = [
	/\bremov(?:e|al|ing|ed)\b/,
	/\bdelet(?:e|es|ing|ed)\b/,
	/\bbin\b/,
	/\btoss/,
	/\bthrow (?:it |them |these |those )?(?:out|away)\b/,
	/\bget rid of\b/,
	/\bclear out\b/,
	/\bdiscard/,
];

/**
 * Filter available tool names for this turn based on the latest user text.
 * Empty text never expands capability — only core read/context tools.
 * Intent detection may shrink the authorized set; it never grants new scopes.
 */
export function resolveCopilotActiveTools(
	availableToolNames: string[],
	userText: string,
	options: ResolveCopilotActiveToolsOptions = {},
): string[] {
	const available = new Set(availableToolNames);
	const text = userText.trim().toLowerCase();

	const selected = new Set<string>();
	for (const name of CORE_TOOLS) {
		if (available.has(name)) selected.add(name);
	}
	// Carry-forward only re-opens groups the caller already authorized
	// (`available`). It never adds a tool outside that set.
	const carryForward = new Set(options.carryForward ?? []);
	const addCarryForward = () => {
		if (carryForward.has("inventory")) {
			for (const name of INVENTORY_WRITE) {
				if (available.has(name)) selected.add(name);
			}
		}
		if (carryForward.has("manifest")) {
			for (const name of MANIFEST_WRITE) {
				if (available.has(name)) selected.add(name);
			}
		}
	};
	if (!text) {
		addCarryForward();
		return availableToolNames.filter((name) => selected.has(name));
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
	const wantInventoryWordForms =
		options.wordForms === true &&
		includesAny(text, INVENTORY_DELETE_WORD_FORMS);
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
		/\btonight\b/,
		/\beat\b/,
		/\bate\b/,
		/\bsnack\b/,
		/\bremaining\b/,
		/\bleft\b/,
		/\bbudget\b/,
		/\bfits\b/,
		/\bconsumed\b/,
		/\bprotein\b/,
		/\bintake\b/,
		/\bfiber\b/,
		/\bplate[- ]?up\b/,
		/\bserving\b/,
	]);

	const addGroup = (group: readonly string[]) => {
		for (const name of group) {
			if (available.has(name)) selected.add(name);
		}
	};

	const matchedDomains = [
		wantInventory || wantInventoryWordForms,
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
		if (wantInventory || wantInventoryWordForms) addGroup(INVENTORY_WRITE);
		if (wantGalley) addGroup(GALLEY_WRITE);
		if (wantManifest) addGroup(MANIFEST_WRITE);
		if (wantSupply) addGroup(SUPPLY_WRITE);
		if (wantPrefs) addGroup(PREFERENCES_WRITE);
		if (wantNutrition) addGroup(NUTRITION_TOOLS);
	}

	addCarryForward();

	// No write-domain match: keep core reads only (plus any already selected).
	// If the user asked something that needs writes but keywords missed, they can
	// rephrase; broad "help with kitchen" still has summary/read tools.
	const result = availableToolNames.filter((name) => selected.has(name));
	// Safety: never return empty when tools exist — fall back to core reads only.
	if (result.length > 0) return result;
	return availableToolNames.filter((name) =>
		(CORE_TOOLS as readonly string[]).includes(name),
	);
}
