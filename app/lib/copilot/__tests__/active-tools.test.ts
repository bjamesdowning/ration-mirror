import { describe, expect, it } from "vitest";
import { resolveCopilotActiveTools } from "../active-tools.server";

const ALL = [
	"search_docs",
	"get_context",
	"get_kitchen_summary",
	"list_inventory",
	"add_cargo_item",
	"remove_cargo_item",
	"preview_inventory_import",
	"apply_inventory_import",
	"preview_inventory_remove",
	"apply_inventory_remove",
	"create_meal",
	"propose_manifest_plan",
	"commit_manifest_plan",
	"mark_supply_purchased_bulk",
	"update_user_preferences",
];

describe("resolveCopilotActiveTools", () => {
	it("keeps only core tools for empty text", () => {
		const tools = resolveCopilotActiveTools(ALL, "");
		expect(tools).toContain("get_context");
		expect(tools).toContain("list_inventory");
		expect(tools).toContain("create_meal");
		expect(tools).not.toContain("add_cargo_item");
		expect(tools).not.toContain("commit_manifest_plan");
	});

	it("always includes create_meal and propose_manifest_plan in core", () => {
		const tools = resolveCopilotActiveTools(ALL, "What's expiring this week?");
		expect(tools).toContain("create_meal");
		expect(tools).toContain("propose_manifest_plan");
		expect(tools).toContain("list_inventory");
		expect(tools).not.toContain("commit_manifest_plan");
	});

	it("scopes inventory writes for pantry delete requests", () => {
		const tools = resolveCopilotActiveTools(
			ALL,
			"Delete milk and eggs from cargo",
		);
		expect(tools).toContain("remove_cargo_item");
		expect(tools).toContain("preview_inventory_remove");
		expect(tools).toContain("list_inventory");
		expect(tools).toContain("create_meal");
		expect(tools).not.toContain("commit_manifest_plan");
	});

	it("scopes galley writes for recipe requests", () => {
		const tools = resolveCopilotActiveTools(
			ALL,
			"Create a pasta recipe in Galley",
		);
		expect(tools).toContain("create_meal");
		expect(tools).not.toContain("add_cargo_item");
	});

	it("matches stock up / fill / restock inventory keywords", () => {
		const tools = resolveCopilotActiveTools(
			ALL,
			"stock up my pantry with fresh milk",
		);
		expect(tools).toContain("add_cargo_item");
		expect(tools).toContain("preview_inventory_import");
	});

	it("opens all write groups for multi-domain requests", () => {
		const tools = resolveCopilotActiveTools(
			ALL,
			"Create a meal plan and fill inventory",
		);
		expect(tools).toContain("create_meal");
		expect(tools).toContain("commit_manifest_plan");
		expect(tools).toContain("add_cargo_item");
	});

	it("scopes nutrition tools for calorie / intake keywords", () => {
		const tools = resolveCopilotActiveTools(
			[
				...ALL,
				"get_nutrition_summary",
				"list_nutrition_intakes",
				"set_nutrition_goal",
				"clear_nutrition_goal",
				"log_manifest_intake",
				"clear_manifest_intake",
				"cook_manifest_entries",
				"consume_manifest_entries",
			],
			"How many kcal did I consume this week vs my goal?",
		);
		expect(tools).toContain("get_nutrition_summary");
		expect(tools).toContain("list_nutrition_intakes");
		expect(tools).toContain("set_nutrition_goal");
		expect(tools).toContain("clear_nutrition_goal");
		expect(tools).toContain("log_manifest_intake");
		expect(tools).toContain("cook_manifest_entries");
	});

	it("includes Eat tools for ate / intake nutrition phrasing", () => {
		const tools = resolveCopilotActiveTools(
			[
				...ALL,
				"consume_manifest_entries",
				"log_manifest_intake",
				"get_nutrition_summary",
			],
			"I ate lunch and want nutrition logged",
		);
		expect(tools).toContain("log_manifest_intake");
		expect(tools).toContain("consume_manifest_entries");
		expect(tools).toContain("get_nutrition_summary");
	});

	it("includes nutrition tools when multi-domain opens all writes", () => {
		const tools = resolveCopilotActiveTools(
			[...ALL, "log_manifest_intake", "cook_manifest_entries"],
			"Create a meal plan and log my nutrition intake",
		);
		expect(tools).toContain("commit_manifest_plan");
		expect(tools).toContain("log_manifest_intake");
		expect(tools).toContain("cook_manifest_entries");
	});
});
