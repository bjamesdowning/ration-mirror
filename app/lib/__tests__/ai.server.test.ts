import { describe, expect, it } from "vitest";
import { extractFinishReason, extractModelText } from "~/lib/ai.server";

describe("extractModelText", () => {
	it("returns null for empty candidates", () => {
		expect(extractModelText({ candidates: [] })).toBeNull();
	});

	it("returns the first text part when only one exists", () => {
		expect(
			extractModelText({
				candidates: [{ content: { parts: [{ text: '{"items":[]}' }] } }],
			}),
		).toBe('{"items":[]}');
	});

	it("concatenates multiple text parts", () => {
		expect(
			extractModelText({
				candidates: [
					{
						content: {
							parts: [{ text: "prefix" }, { text: '{"items":[]}' }],
						},
					},
				],
			}),
		).toBe('prefix\n{"items":[]}');
	});
});

describe("extractFinishReason", () => {
	it("reads finishReason from the first candidate", () => {
		expect(
			extractFinishReason({
				candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }],
			}),
		).toBe("MAX_TOKENS");
	});
});
