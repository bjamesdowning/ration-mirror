import { describe, expect, it } from "vitest";
import { isStructuredCopilotToolFailure } from "../tool-result";

describe("isStructuredCopilotToolFailure", () => {
	it("detects structured tool failures", () => {
		expect(
			isStructuredCopilotToolFailure({
				ok: false,
				error: { code: "not_found", message: "Missing" },
			}),
		).toBe(true);
	});

	it("rejects successes and malformed payloads", () => {
		expect(isStructuredCopilotToolFailure({ id: "c1", quantity: 0 })).toBe(
			false,
		);
		expect(isStructuredCopilotToolFailure({ ok: true, data: {} })).toBe(false);
		expect(isStructuredCopilotToolFailure({ ok: false })).toBe(false);
		expect(isStructuredCopilotToolFailure(null)).toBe(false);
	});
});
