import { describe, expect, it } from "vitest";
import {
	AI_MODEL,
	getGenerationConfig,
	type ThinkingLevel,
} from "~/lib/ai-config.server";

describe("ai-config.server", () => {
	it("AI_MODEL is gemini-3.5-flash", () => {
		expect(AI_MODEL).toBe("gemini-3.5-flash");
	});

	it.each<ThinkingLevel>([
		"LOW",
		"MEDIUM",
		"HIGH",
	])("getGenerationConfig(%s) returns generationConfig with thinkingConfig", (level) => {
		const config = getGenerationConfig(level);
		expect(config).toEqual({
			generationConfig: {
				thinkingConfig: {
					thinkingLevel: level,
					includeThoughts: false,
				},
			},
		});
	});
});
