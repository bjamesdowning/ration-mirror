import { describe, expect, it } from "vitest";
import { resolveCopilotToolEnd } from "../copilot/tool-event.client";

describe("resolveCopilotToolEnd", () => {
	it("uses the matching start-event name and failure status", () => {
		const names = new Map([["call-1", "delete_meal"]]);

		expect(
			resolveCopilotToolEnd({ toolCallId: "call-1", ok: false }, names),
		).toEqual({
			toolName: "delete_meal",
			succeeded: false,
		});
		expect(names.size).toBe(0);
	});

	it("falls back safely for an unknown successful call", () => {
		expect(
			resolveCopilotToolEnd(
				{ toolCallId: "missing", ok: true },
				new Map<string, string>(),
			),
		).toEqual({
			toolName: "tool",
			succeeded: true,
		});
	});
});
