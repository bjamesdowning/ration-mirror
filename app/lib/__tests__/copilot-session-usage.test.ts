import { describe, expect, it } from "vitest";
import {
	buildSessionUsageSnapshot,
	evaluateSessionLimitWarning,
	formatCopilotTokenCount,
} from "../copilot/session-usage";

describe("formatCopilotTokenCount", () => {
	it("formats large counts in kilo units", () => {
		expect(formatCopilotTokenCount(42_500)).toBe("43k");
		expect(formatCopilotTokenCount(128_000)).toBe("128k");
	});

	it("formats small counts literally", () => {
		expect(formatCopilotTokenCount(999)).toBe("999");
	});
});

describe("buildSessionUsageSnapshot", () => {
	it("builds a normalized usage snapshot", () => {
		expect(
			buildSessionUsageSnapshot({
				totalTokens: 12_345.2,
				messageCount: 8,
				creditsCharged: 1,
				creditBalance: 11,
			}),
		).toEqual({
			totalTokens: 12_346,
			maxTokens: 128_000,
			messageCount: 8,
			maxMessages: 40,
			creditsCharged: 1,
			creditBalance: 11,
			nextCreditAt: 7_655,
			nextCreditThreshold: 20_001,
		});
	});
});

describe("evaluateSessionLimitWarning", () => {
	it("returns soft warning at 50% tokens", () => {
		const warning = evaluateSessionLimitWarning({
			totalTokens: 64_000,
			messageCount: 10,
			emittedSoft: false,
			emittedUrgent: false,
		});
		expect(warning?.severity).toBe("soft");
	});

	it("returns urgent warning at 85% tokens", () => {
		const warning = evaluateSessionLimitWarning({
			totalTokens: 109_000,
			messageCount: 10,
			emittedSoft: false,
			emittedUrgent: false,
		});
		expect(warning?.severity).toBe("urgent");
	});

	it("prefers urgent over soft when both thresholds are crossed", () => {
		const warning = evaluateSessionLimitWarning({
			totalTokens: 109_000,
			messageCount: 36,
			emittedSoft: false,
			emittedUrgent: false,
		});
		expect(warning?.severity).toBe("urgent");
	});

	it("does not repeat warnings once emitted", () => {
		expect(
			evaluateSessionLimitWarning({
				totalTokens: 109_000,
				messageCount: 36,
				emittedSoft: true,
				emittedUrgent: true,
			}),
		).toBeNull();
	});
});
