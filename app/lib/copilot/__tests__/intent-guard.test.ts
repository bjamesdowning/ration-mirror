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
});
