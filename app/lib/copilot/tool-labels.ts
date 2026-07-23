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
	inventory_import_schema: {
		running: "Loading Cargo import format…",
		done: "Loaded Cargo import format",
		error: "Could not load import format",
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
	mark_supply_purchased: {
		running: "Updating Supply…",
		done: "Updated Supply",
		error: "Could not update Supply",
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
	bulk_add_meal_plan_entries: {
		running: "Building your Manifest…",
		done: "Built your Manifest",
		error: "Could not build Manifest",
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
	toggle_meal_active: {
		running: "Updating Galley selection…",
		done: "Updated Galley selection",
		error: "Could not update Galley selection",
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
	start_plan_week: {
		running: "Starting AI Plan Week…",
		done: "AI Plan Week queued",
		error: "Could not start AI Plan Week",
	},
	start_generate_meal: {
		running: "Starting AI meal generation…",
		done: "AI meal generation queued",
		error: "Could not start AI meal generation",
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
};

export function copilotToolLabel(
	toolName: string,
	phase: "running" | "done" | "error",
): string {
	const labels = COPILOT_TOOL_LABELS[toolName] ?? DEFAULT_LABELS;
	return labels[phase];
}
