import { describe, expect, it } from "vitest";
import {
	extractFirstJsonValue,
	parseModelJson,
	repairTrailingCommas,
	stripMarkdownJsonFences,
} from "~/lib/parse-model-json";

describe("stripMarkdownJsonFences", () => {
	it("removes json fences", () => {
		expect(stripMarkdownJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
	});
});

describe("extractFirstJsonValue", () => {
	it("extracts object wrapped in prose", () => {
		expect(extractFirstJsonValue('Here you go:\n{"items":[]}\nThanks')).toBe(
			'{"items":[]}',
		);
	});

	it("respects braces inside strings", () => {
		expect(extractFirstJsonValue('{"name":"a { b}","x":1}')).toBe(
			'{"name":"a { b}","x":1}',
		);
	});
});

describe("repairTrailingCommas", () => {
	it("removes trailing commas before closing braces", () => {
		expect(repairTrailingCommas('{"a":1,}')).toBe('{"a":1}');
		expect(repairTrailingCommas('{"items":[{"n":1},]}')).toBe(
			'{"items":[{"n":1}]}',
		);
	});
});

describe("parseModelJson", () => {
	it("parses clean JSON", () => {
		expect(parseModelJson('{"items":[]}')).toEqual({ items: [] });
	});

	it("parses fenced JSON", () => {
		expect(parseModelJson('```json\n{"items":[{"name":"milk"}]}\n```')).toEqual(
			{ items: [{ name: "milk" }] },
		);
	});

	it("parses JSON with trailing commas via repair", () => {
		expect(parseModelJson('{"items":[{"name":"eggs"},],}')).toEqual({
			items: [{ name: "eggs" }],
		});
	});

	it("parses JSON embedded in prose", () => {
		expect(
			parseModelJson(
				'Sure.\n{"items":[{"name":"butter","quantity":1}]}\nDone.',
			),
		).toEqual({ items: [{ name: "butter", quantity: 1 }] });
	});

	it("returns null for malformed JSON like missing colon", () => {
		const broken = '{"items":[{"name" "butter","quantity":1,"unit":"tbsp"}]}';
		expect(parseModelJson(broken)).toBeNull();
	});

	it("returns null for empty input", () => {
		expect(parseModelJson("")).toBeNull();
		expect(parseModelJson("   ")).toBeNull();
	});
});
