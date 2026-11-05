import { describe, expect, it } from "vitest";
import {
	buildAgentTemporalContext,
	formatCopilotTemporalContextAppend,
} from "~/lib/agent/temporal-context.server";

describe("temporal-context", () => {
	it("formats copilot append with UTC calendar semantics", () => {
		const now = new Date("2026-07-13T16:34:00.000Z");
		const append = formatCopilotTemporalContextAppend(now);
		expect(append).toContain("Today is 2026-07-13 (UTC)");
		expect(append).toContain("2026-07-13T16:34:00.000Z");
		expect(append).toContain("UTC calendar days");
	});

	it("buildAgentTemporalContext matches append date fields", () => {
		const now = new Date("2026-07-13T16:34:00.000Z");
		const ctx = buildAgentTemporalContext(now);
		expect(formatCopilotTemporalContextAppend(now)).toContain(
			`Today is ${ctx.todayUtc} (UTC)`,
		);
		expect(ctx.timeZone).toBeNull();
		expect(ctx.today).toBe(ctx.todayUtc);
	});

	it("names the kitchen zone and still describes expiry as UTC", () => {
		const now = new Date("2026-07-13T23:30:00.000Z");
		const metadata = { supplySettings: { timeZone: "Europe/Dublin" } };
		const append = formatCopilotTemporalContextAppend(now, metadata);
		expect(append).toContain("Today is 2026-07-14 (Europe/Dublin)");
		expect(append).toContain("UTC calendar days");
		expect(buildAgentTemporalContext(now, metadata).todayUtc).toBe(
			"2026-07-13",
		);
	});

	it("keeps the UTC label when the kitchen has no zone", () => {
		const now = new Date("2026-07-13T23:30:00.000Z");
		expect(formatCopilotTemporalContextAppend(now, {})).toContain(
			"Today is 2026-07-13 (UTC)",
		);
	});
});
