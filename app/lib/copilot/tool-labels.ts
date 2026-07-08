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
	remove_cargo_item: {
		running: "Removing from Cargo…",
		done: "Removed from Cargo",
		error: "Could not remove from Cargo",
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
	add_meal_plan_entry: {
		running: "Adding to Manifest…",
		done: "Added to Manifest",
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
	get_context: {
		running: "Loading Ration context…",
		done: "Loaded context",
		error: "Context lookup failed",
	},
};

export function copilotToolLabel(
	toolName: string,
	phase: "running" | "done" | "error",
): string {
	const labels = COPILOT_TOOL_LABELS[toolName] ?? DEFAULT_LABELS;
	return labels[phase];
}
