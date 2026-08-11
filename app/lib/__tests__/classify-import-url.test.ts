import { describe, expect, it } from "vitest";
import {
	classifyImportUrl,
	isSocialImportKind,
	laneFlagForSource,
} from "~/lib/import/classify-import-url";

describe("classifyImportUrl", () => {
	it("classifies TikTok hosts", () => {
		expect(classifyImportUrl("https://www.tiktok.com/@u/video/1")).toBe(
			"tiktok",
		);
		expect(classifyImportUrl("https://vm.tiktok.com/ZMabc")).toBe("tiktok");
	});

	it("classifies YouTube hosts", () => {
		expect(classifyImportUrl("https://www.youtube.com/watch?v=abc")).toBe(
			"youtube",
		);
		expect(classifyImportUrl("https://youtu.be/abc")).toBe("youtube");
		expect(classifyImportUrl("https://www.youtube.com/shorts/abc")).toBe(
			"youtube",
		);
	});

	it("classifies Instagram hosts", () => {
		expect(classifyImportUrl("https://www.instagram.com/reel/abc/")).toBe(
			"instagram",
		);
	});

	it("defaults to web for recipe sites", () => {
		expect(classifyImportUrl("https://www.allrecipes.com/recipe/1/")).toBe(
			"web",
		);
	});

	it("maps lane flags", () => {
		expect(laneFlagForSource("web")).toBe("ai-import-web");
		expect(laneFlagForSource("tiktok")).toBe("ai-import-social");
		expect(laneFlagForSource("photo")).toBe("ai-import-photo");
		expect(isSocialImportKind("youtube")).toBe(true);
		expect(isSocialImportKind("web")).toBe(false);
	});
});
