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
	});
});
