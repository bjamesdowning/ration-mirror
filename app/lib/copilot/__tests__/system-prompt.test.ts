import { describe, expect, it } from "vitest";
import { buildAgentTemporalContext } from "~/lib/agent/temporal-context.server";
import { getCopilotSystemPrompt } from "~/lib/copilot/system-prompt.server";

describe("getCopilotSystemPrompt", () => {
	it("includes action-first capabilities and expired-is-expired guidance", () => {
		const prompt = getCopilotSystemPrompt();
		expect(prompt).toContain("Capabilities:");
		expect(prompt).toContain("Never tell the user to use the app instead");
		expect(prompt).toContain("Expired is expired");
		expect(prompt).not.toContain("Before acting, briefly note");
		expect(prompt).toContain("Native feature disclosure:");
		expect(prompt).not.toContain("Galley Generate");
		expect(prompt).not.toContain("start_generate_meal");
		expect(prompt).not.toContain("start_plan_week");
		expect(prompt).toContain("Remaining-macros workflow");
		expect(prompt).toContain("quick_eat_cargo");
		expect(prompt).toContain("Never create_meal from a URL");
	});

	it("includes temporal and expiry tool guidance", () => {
		const prompt = getCopilotSystemPrompt();
		expect(prompt).toContain("injected temporal context");
		expect(prompt).toContain("get_expired_items");
		expect(prompt).toContain("get_kitchen_summary");
	});

	it("includes billing tool guidance", () => {
		const prompt = getCopilotSystemPrompt();
		expect(prompt).toContain("get_billing_summary");
		expect(prompt).toContain("Never ask for card numbers");
	});

	it("includes unit alias normalization guidance", () => {
		const prompt = getCopilotSystemPrompt();
		expect(prompt).toContain("Prefer SI unit symbols");
		expect(prompt).toContain("normalized server-side");
		expect(prompt).toContain("unit warning");
	});

	it("requires action reporting for writes but not read-only tools", () => {
		const prompt = getCopilotSystemPrompt();
		expect(prompt).toContain("Action reporting:");
		expect(prompt).toContain("Do not narrate read-only lookups or search_docs");
		expect(prompt).toContain("created, updated, deleted, imported, consumed");
		expect(prompt).toContain("ok: false");
		expect(prompt).toContain("adjust_cargo_item");
		expect(prompt).toContain("restock reminder");
		expect(prompt).toContain("propose_manifest_plan");
		expect(prompt).toContain("call apply_inventory_import");
		expect(prompt).toContain("Do not ask again");
		expect(prompt).toContain("preview_inventory_remove");
		expect(prompt).toContain("Never loop add_cargo_item");
		expect(prompt).toContain("Never loop remove_cargo_item");
	});

	it("includes nutrition guidance and no medical advice", () => {
		const prompt = getCopilotSystemPrompt();
		expect(prompt).toContain("Nutrition (when flags enabled");
		expect(prompt).toContain("Cook ≠ Eat");
		expect(prompt).toContain("log_manifest_intake");
		expect(prompt).toContain("gramsPerServing");
		expect(prompt).toContain("0.01");
		expect(prompt).toContain("a few bites");
		expect(prompt).toContain("never invent grams");
		expect(prompt).toContain("whole pot");
		expect(prompt).toContain("cook_manifest_entries");
		expect(prompt).toContain("get_nutrition_summary");
		expect(prompt).toContain("vsGoal");
		expect(prompt).toContain("Do not give medical");
		expect(prompt).toContain("feature_disabled");
		expect(prompt).toContain("quick_eat_cargo");
	});

	it("includes readable output formatting guidance", () => {
		const prompt = getCopilotSystemPrompt();
		expect(prompt).toContain("Output format:");
		expect(prompt).toContain("bullet or numbered lists");
		expect(prompt).toContain("Avoid dense walls of text");
	});
});

describe("buildAgentTemporalContext", () => {
	it("returns UTC calendar metadata", () => {
		const now = new Date("2026-07-13T16:34:00.000Z");
		expect(buildAgentTemporalContext(now)).toEqual({
			todayUtc: "2026-07-13",
			serverTimeIso: "2026-07-13T16:34:00.000Z",
			expirySemantics: "utc_calendar_day",
		});
	});
});
