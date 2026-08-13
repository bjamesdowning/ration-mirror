import { describe, expect, it } from "vitest";
import { detectBlockedCopilotIntent } from "../intent-guard.server";

describe("detectBlockedCopilotIntent", () => {
	it("hard-blocks camera/image scan phrases", () => {
		expect(
			detectBlockedCopilotIntent("scan this receipt photo", {
				"ai-scan-receipt": true,
				"ai-import-url": true,
			})?.feature,
		).toBe("scan");
		expect(
			detectBlockedCopilotIntent("please run ocr on this", {
				"ai-scan-receipt": true,
				"ai-import-url": true,
			})?.feature,
		).toBe("scan");
	});

	it("does not block plain text grocery list import", () => {
		expect(
			detectBlockedCopilotIntent("import this grocery list into cargo", {
				"ai-scan-receipt": true,
				"ai-import-url": true,
			}),
		).toBeNull();
	});

	it("hard-blocks recipe URL import", () => {
		expect(
			detectBlockedCopilotIntent("import https://example.com/recipe", {
				"ai-scan-receipt": true,
				"ai-import-url": true,
			})?.feature,
		).toBe("import_url");
	});

	it("hard-blocks a bare Instagram URL", () => {
		expect(
			detectBlockedCopilotIntent("https://www.instagram.com/p/abc123", {
				"ai-scan-receipt": true,
				"ai-import-url": true,
			})?.feature,
		).toBe("import_url");
	});

	it("hard-blocks bare TikTok and YouTube URLs", () => {
		expect(
			detectBlockedCopilotIntent("https://vm.tiktok.com/ZMabc", {
				"ai-scan-receipt": true,
				"ai-import-url": true,
			})?.feature,
		).toBe("import_url");
		expect(
			detectBlockedCopilotIntent("https://youtu.be/abc", {
				"ai-scan-receipt": true,
				"ai-import-url": true,
			})?.feature,
		).toBe("import_url");
	});

	it("hard-blocks a bare recipe-site HTTPS URL", () => {
		expect(
			detectBlockedCopilotIntent("https://www.allrecipes.com/recipe/1/", {
				"ai-scan-receipt": true,
				"ai-import-url": true,
			})?.feature,
		).toBe("import_url");
	});

	it("hard-blocks this-reel / social recipe phrasing without a URL", () => {
		expect(
			detectBlockedCopilotIntent("this tiktok recipe looks good", {
				"ai-scan-receipt": true,
				"ai-import-url": true,
			})?.feature,
		).toBe("import_url");
		expect(
			detectBlockedCopilotIntent("save this reel", {
				"ai-scan-receipt": true,
				"ai-import-url": true,
			})?.feature,
		).toBe("import_url");
	});
});
