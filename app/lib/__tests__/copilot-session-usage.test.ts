import { describe, expect, it } from "vitest";
import {
	buildSessionUsageSnapshot,
	evaluateSessionLimitWarning,
	formatCopilotTokenCount,
	tokensUntilNextBracket,
} from "../copilot/session-usage";

describe("formatCopilotTokenCount", () => {
	it("formats large counts in kilo units", () => {
		expect(formatCopilotTokenCount(42_500)).toBe("43k");
		expect(formatCopilotTokenCount(60_000)).toBe("60k");
	});

	it("formats small counts literally", () => {
		expect(formatCopilotTokenCount(999)).toBe("999");
	});
});

describe("tokensUntilNextBracket", () => {
	it.each([
		[10_000, 2_001],
		[12_000, 1],
		[30_000, 1],
		[60_001, null],
	])("maps %i tokens to %s until next bracket", (tokens, expected) => {
		expect(tokensUntilNextBracket(tokens)).toBe(expected);
	});
});

describe("buildSessionUsageSnapshot", () => {
	it("builds a normalized usage snapshot", () => {
		expect(
			buildSessionUsageSnapshot({
				totalTokens: 12_345.2,
				messageCount: 8,
				creditsCharged: 2,
				creditBalance: 11,
			}),
		).toEqual({
			totalTokens: 12_346,
			maxTokens: 60_000,
			messageCount: 8,
			maxMessages: 40,
			creditsCharged: 2,
			creditBalance: 11,
			nextBracketAt: 17_655,
		});
	});
});

describe("evaluateSessionLimitWarning", () => {
	it("returns soft warning at 75% tokens", () => {
		const warning = evaluateSessionLimitWarning({
			totalTokens: 45_000,
			messageCount: 10,
			emittedSoft: false,
			emittedUrgent: false,
		});
		expect(warning?.severity).toBe("soft");
	});

	it("returns urgent warning at 90% tokens", () => {
		const warning = evaluateSessionLimitWarning({
			totalTokens: 54_000,
			messageCount: 10,
			emittedSoft: false,
			emittedUrgent: false,
		});
		expect(warning?.severity).toBe("urgent");
	});

	it("prefers urgent over soft when both thresholds are crossed", () => {
		const warning = evaluateSessionLimitWarning({
			totalTokens: 54_000,
			messageCount: 36,
			emittedSoft: false,
			emittedUrgent: false,
		});
		expect(warning?.severity).toBe("urgent");
	});

	it("does not repeat warnings once emitted", () => {
		expect(
			evaluateSessionLimitWarning({
				totalTokens: 54_000,
				messageCount: 36,
				emittedSoft: true,
				emittedUrgent: true,
			}),
		).toBeNull();
	});
});
