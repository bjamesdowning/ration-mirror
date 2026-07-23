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
	"commit_manifest_plan",
	"mark_supply_purchased_bulk",
	"update_user_preferences",
];

describe("resolveCopilotActiveTools", () => {
	it("keeps full set for empty text", () => {
		expect(resolveCopilotActiveTools(ALL, "")).toEqual(ALL);
	});

	it("scopes inventory writes for pantry delete requests", () => {
		const tools = resolveCopilotActiveTools(
			ALL,
			"Delete milk and eggs from cargo",
		);
		expect(tools).toContain("remove_cargo_item");
		expect(tools).toContain("preview_inventory_remove");
		expect(tools).toContain("list_inventory");
		expect(tools).not.toContain("commit_manifest_plan");
		expect(tools).not.toContain("create_meal");
	});

	it("scopes galley writes for recipe requests", () => {
		const tools = resolveCopilotActiveTools(
			ALL,
			"Create a pasta recipe in Galley",
		);
		expect(tools).toContain("create_meal");
		expect(tools).not.toContain("add_cargo_item");
	});
});
