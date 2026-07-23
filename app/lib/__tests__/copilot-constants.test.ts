import { describe, expect, it } from "vitest";
import {
	COPILOT_SESSION_MAX_MESSAGES,
	COPILOT_SESSION_MAX_TOKENS,
	COPILOT_TOKENS_PER_CREDIT,
	creditsForCopilotTokens,
	nextCreditThreshold,
	tokensUntilNextCredit,
} from "../copilot/constants";

describe("creditsForCopilotTokens", () => {
	it.each([
		[0, 1],
		[12_000, 1],
		[20_000, 1],
		[20_001, 2],
		[30_000, 2],
		[60_000, 3],
		[61_000, 4],
		[128_000, 7],
		[500_000, 25],
	])("maps %i tokens to %i credits", (tokens, credits) => {
		expect(creditsForCopilotTokens(tokens)).toBe(credits);
	});
});

describe("tokensUntilNextCredit", () => {
	it("returns distance to next 20k tier", () => {
		expect(tokensUntilNextCredit(12_000)).toBe(8_001);
		expect(tokensUntilNextCredit(20_000)).toBe(1);
	});

	it("returns null at session cap", () => {
		expect(tokensUntilNextCredit(COPILOT_SESSION_MAX_TOKENS)).toBeNull();
	});
});

describe("nextCreditThreshold", () => {
	it("returns the absolute token count for the next tier", () => {
		expect(nextCreditThreshold(12_000)).toBe(20_001);
		expect(nextCreditThreshold(60_000)).toBe(60_001);
	});

	it("returns null at session cap", () => {
		expect(nextCreditThreshold(COPILOT_SESSION_MAX_TOKENS)).toBeNull();
	});
});

describe("linear billing constants", () => {
	it("uses 20k tokens per credit", () => {
		expect(COPILOT_TOKENS_PER_CREDIT).toBe(20_000);
	});

	it("caps sessions at 500k tokens and 120 messages", () => {
		expect(COPILOT_SESSION_MAX_TOKENS).toBe(500_000);
		expect(COPILOT_SESSION_MAX_MESSAGES).toBe(120);
		expect(
			Math.ceil(COPILOT_SESSION_MAX_TOKENS / COPILOT_TOKENS_PER_CREDIT),
		).toBe(25);
	});
});
