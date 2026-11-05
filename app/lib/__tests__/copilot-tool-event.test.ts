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

	it("labels a successful supply sync with the net line change", () => {
		const names = new Map([["call-2", "sync_supply_from_selected_meals"]]);
		expect(
			resolveCopilotToolEnd(
				{
					toolCallId: "call-2",
					ok: true,
					result: {
						data: {
							summary: { newLines: 0, removedLines: 1, changedLines: 0 },
						},
					},
				},
				names,
			),
		).toEqual({
			toolName: "sync_supply_from_selected_meals",
			succeeded: true,
			doneLabel: "0 new, 1 removed, 0 changed",
		});
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
