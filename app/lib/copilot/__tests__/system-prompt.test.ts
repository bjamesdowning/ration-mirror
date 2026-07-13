import { describe, expect, it } from "vitest";
import { buildAgentTemporalContext } from "~/lib/agent/temporal-context.server";
import { getCopilotSystemPrompt } from "~/lib/copilot/system-prompt.server";

describe("getCopilotSystemPrompt", () => {
	it("includes temporal and expiry tool guidance", () => {
		const prompt = getCopilotSystemPrompt();
		expect(prompt).toContain("injected temporal context");
		expect(prompt).toContain("get_expired_items");
		expect(prompt).toContain("get_kitchen_summary");
	});

	it("requires action reporting for writes but not read-only tools", () => {
		const prompt = getCopilotSystemPrompt();
		expect(prompt).toContain("Action reporting:");
		expect(prompt).toContain("Do not narrate read-only lookups or search_docs");
		expect(prompt).toContain("created, updated, deleted, imported, consumed");
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
