import { describe, expect, it } from "vitest";
import {
	COPILOT_DISPLAY_BRACKETS,
	creditsForCopilotTokens,
} from "../copilot/constants";

describe("COPILOT_DISPLAY_BRACKETS", () => {
	it("excludes tiers above the session cap", () => {
		expect(COPILOT_DISPLAY_BRACKETS).toHaveLength(3);
		expect(
			COPILOT_DISPLAY_BRACKETS.every((bracket) => bracket.maxTokens !== null),
		).toBe(true);
	});
});

describe("creditsForCopilotTokens", () => {
	it.each([
		[0, 1],
		[12_000, 1],
		[12_001, 2],
		[30_000, 2],
		[30_001, 3],
		[60_000, 3],
		[60_001, 4],
	])("maps %i tokens to %i credits", (tokens, credits) => {
		expect(creditsForCopilotTokens(tokens)).toBe(credits);
	});
});
