import { describe, expect, it } from "vitest";
import { extractImportUrl } from "~/lib/import/extract-import-url";

describe("extractImportUrl", () => {
	it("returns null when there is no HTTPS URL", () => {
		expect(extractImportUrl("import this grocery list")).toBeNull();
		expect(extractImportUrl("http://example.com/recipe")).toBeNull();
	});

	it("extracts the first HTTPS URL and classifies Instagram", () => {
		expect(
			extractImportUrl("try this https://www.instagram.com/p/abc123 tonight"),
		).toEqual({
			url: "https://www.instagram.com/p/abc123",
			kind: "instagram",
		});
	});

	it("classifies TikTok and YouTube short hosts", () => {
		expect(extractImportUrl("https://vm.tiktok.com/ZMabc")).toEqual({
			url: "https://vm.tiktok.com/ZMabc",
			kind: "tiktok",
		});
		expect(extractImportUrl("https://youtu.be/abc")).toEqual({
			url: "https://youtu.be/abc",
			kind: "youtube",
		});
	});

	it("defaults recipe sites to web and strips trailing punctuation", () => {
		expect(
			extractImportUrl("See https://www.allrecipes.com/recipe/1/."),
		).toEqual({
			url: "https://www.allrecipes.com/recipe/1/",
			kind: "web",
		});
	});
});
