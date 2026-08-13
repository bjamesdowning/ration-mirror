export type CopilotToolLabelSet = {
	running: string;
	done: string;
	error: string;
};

const DEFAULT_LABELS: CopilotToolLabelSet = {
	running: "Working on it…",
	done: "Done",
	error: "Something went wrong",
};

export const COPILOT_TOOL_LABELS: Record<string, CopilotToolLabelSet> = {
	search_docs: {
		running: "Searching Ration docs…",
		done: "Searched docs",
		error: "Doc search failed",
	},
	search_ingredients: {
		running: "Searching ingredients…",
		done: "Searched ingredients",
		error: "Ingredient search failed",
	},
	list_inventory: {
		running: "Checking your Cargo…",
		done: "Checked Cargo",
		error: "Cargo lookup failed",
	},
	get_cargo_item: {
		running: "Looking up cargo item…",
		done: "Found cargo item",
		error: "Cargo lookup failed",
	},
	get_expiring_items: {
		running: "Checking expiring items…",
		done: "Checked expiring items",
		error: "Expiry check failed",
	},
	get_expired_items: {
		running: "Checking expired items…",
		done: "Checked expired items",
		error: "Expired check failed",
	},
	get_kitchen_summary: {
		running: "Summarizing your kitchen…",
		done: "Kitchen summary ready",
		error: "Kitchen summary failed",
	},
	get_kitchen_events: {
		running: "Reading Flight Recorder…",
		done: "Loaded kitchen activity",
		error: "Could not load kitchen activity",
	},
	get_kitchen_stats: {
		running: "Computing kitchen stats…",
		done: "Kitchen stats ready",
		error: "Could not load kitchen stats",
	},
	get_supply_list: {
		running: "Loading your Supply list…",
		done: "Loaded Supply list",
		error: "Supply lookup failed",
	},
	get_meal_plan: {
		running: "Loading your meal plan…",
		done: "Loaded meal plan",
		error: "Meal plan lookup failed",
	},
	list_meals: {
		running: "Browsing your Galley…",
		done: "Browsed Galley",
		error: "Galley lookup failed",
	},
	match_meals: {
		running: "Matching meals to Cargo…",
		done: "Matched meals",
		error: "Meal matching failed",
	},
	add_cargo_item: {
		running: "Adding to Cargo…",
		done: "Added to Cargo",
		error: "Could not add to Cargo",
	},
	update_cargo_item: {
		running: "Updating Cargo…",
		done: "Updated Cargo",
		error: "Could not update Cargo",
	},
	adjust_cargo_item: {
		running: "Adjusting Cargo…",
		done: "Adjusted Cargo",
		error: "Could not adjust Cargo",
	},
	remove_cargo_item: {
		running: "Removing from Cargo…",
		done: "Removed from Cargo",
		error: "Could not remove from Cargo",
	},
	preview_inventory_remove: {
		running: "Previewing Cargo removals…",
		done: "Previewed Cargo removals",
		error: "Could not preview Cargo removals",
	},
	apply_inventory_remove: {
		running: "Removing Cargo items…",
		done: "Removed Cargo items",
		error: "Could not remove Cargo items",
	},
	preview_inventory_import: {
		running: "Previewing Cargo import…",
		done: "Previewed Cargo import",
		error: "Could not preview Cargo import",
	},
	apply_inventory_import: {
		running: "Importing into Cargo…",
		done: "Imported into Cargo",
		error: "Could not import into Cargo",
	},
	import_inventory_csv: {
		running: "Importing Cargo CSV…",
		done: "Imported Cargo CSV",
		error: "Could not import Cargo CSV",
	},
	add_supply_item: {
		running: "Adding to Supply…",
		done: "Added to Supply",
		error: "Could not add to Supply",
	},
	update_supply_item: {
		running: "Updating Supply…",
		done: "Updated Supply",
		error: "Could not update Supply",
	},
	remove_supply_item: {
		running: "Removing from Supply…",
		done: "Removed from Supply",
		error: "Could not remove from Supply",
	},
	sync_supply_from_selected_meals: {
		running: "Syncing Supply from meals…",
		done: "Synced Supply from meals",
		error: "Could not sync Supply",
	},
	complete_supply_list: {
		running: "Docking purchased supplies…",
		done: "Docked purchased supplies",
		error: "Could not complete Supply list",
	},
	add_meal_plan_entry: {
		running: "Adding to Manifest…",
		done: "Added to Manifest",
		error: "Could not update Manifest",
	},
	update_meal_plan_entry: {
		running: "Updating Manifest…",
		done: "Updated Manifest",
		error: "Could not update Manifest",
	},
	consume_manifest_entries: {
		running: "Logging Manifest meals…",
		done: "Logged Manifest meals",
		error: "Could not log Manifest meals",
	},
	cook_manifest_entries: {
		running: "Cooking Manifest meals…",
		done: "Cooked Manifest meals",
		error: "Could not cook Manifest meals",
	},
	log_manifest_intake: {
		running: "Logging personal intake…",
		done: "Logged personal intake",
		error: "Could not log personal intake",
	},
	clear_manifest_intake: {
		running: "Clearing personal intake…",
		done: "Cleared personal intake",
		error: "Could not clear personal intake",
	},
	list_nutrition_intakes: {
		running: "Loading intake history…",
		done: "Loaded intake history",
		error: "Could not load intake history",
	},
	remove_meal_plan_entry: {
		running: "Removing from Manifest…",
		done: "Removed from Manifest",
		error: "Could not update Manifest",
	},
	create_meal: {
		running: "Creating meal…",
		done: "Created meal",
		error: "Could not create meal",
	},
	update_meal: {
		running: "Updating meal…",
		done: "Updated meal",
		error: "Could not update meal",
	},
	delete_meal: {
		running: "Deleting meal…",
		done: "Deleted meal",
		error: "Could not delete meal",
	},
	clear_active_meals: {
		running: "Clearing Galley selections…",
		done: "Cleared Galley selections",
		error: "Could not clear Galley selections",
	},
	consume_meal: {
		running: "Logging meal and updating Cargo…",
		done: "Logged meal and updated Cargo",
		error: "Could not log meal",
	},
	set_active_meals: {
		running: "Updating Galley selections…",
		done: "Updated Galley selections",
		error: "Could not update Galley selections",
	},
	propose_manifest_plan: {
		running: "Proposing a meal plan…",
		done: "Proposed a meal plan",
		error: "Could not propose a meal plan",
	},
	commit_manifest_plan: {
		running: "Saving meal plan…",
		done: "Saved meal plan",
		error: "Could not save meal plan",
	},
	mark_supply_purchased_bulk: {
		running: "Updating Supply purchases…",
		done: "Updated Supply purchases",
		error: "Could not update Supply purchases",
	},
	quick_eat_cargo: {
		running: "Logging a Quick Eat…",
		done: "Logged Quick Eat",
		error: "Could not log Quick Eat",
	},
	get_context: {
		running: "Loading Ration context…",
		done: "Loaded context",
		error: "Context lookup failed",
	},
	get_billing_summary: {
		running: "Loading billing summary…",
		done: "Loaded billing summary",
		error: "Billing lookup failed",
	},
	get_user_preferences: {
		running: "Loading preferences…",
		done: "Loaded preferences",
		error: "Could not load preferences",
	},
	update_user_preferences: {
		running: "Updating preferences…",
		done: "Updated preferences",
		error: "Could not update preferences",
	},
	get_nutrition_summary: {
		running: "Loading nutrition summary…",
		done: "Loaded nutrition summary",
		error: "Could not load nutrition summary",
	},
	set_nutrition_goal: {
		running: "Saving nutrition goal…",
		done: "Saved nutrition goal",
		error: "Could not save nutrition goal",
	},
	clear_nutrition_goal: {
		running: "Clearing nutrition goal…",
		done: "Cleared nutrition goal",
		error: "Could not clear nutrition goal",
	},
};

export function copilotToolLabel(
	toolName: string,
	phase: "running" | "done" | "error",
): string {
	const labels = COPILOT_TOOL_LABELS[toolName] ?? DEFAULT_LABELS;
	return labels[phase];
}
