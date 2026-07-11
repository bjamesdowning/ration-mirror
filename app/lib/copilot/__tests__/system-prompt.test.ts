import { describe, expect, it } from "vitest";
import { getCopilotSystemPrompt } from "../system-prompt.server";

describe("getCopilotSystemPrompt", () => {
	it("defines Ration scope and refuses unrelated software work", () => {
		const prompt = getCopilotSystemPrompt();

		expect(prompt).toContain("Stay within Ration and kitchen logistics");
		expect(prompt).toContain("Do not write code, scripts, or software");
		expect(prompt).toContain("Do not call tools for out-of-scope requests");
	});

	it("includes native-feature due diligence and deep links", () => {
		const prompt = getCopilotSystemPrompt();

		expect(prompt).toContain("due diligence, not upselling");
		expect(prompt).toContain("ration://scan");
		expect(prompt).toContain("ration://galley/import");
		expect(prompt).toContain("ration://galley/generate");
		expect(prompt).toContain("ration://manifest/plan-week");
	});

	it("includes meal planning and inventory import workflows", () => {
		const prompt = getCopilotSystemPrompt();

		expect(prompt).toContain("bulk_add_meal_plan_entries");
		expect(prompt).toContain("sync_supply_from_selected_meals");
		expect(prompt).toContain("preview_inventory_import");
		expect(prompt).toContain("apply_inventory_import");
	});
});
