import { describe, expect, it } from "vitest";
import {
	buildSessionUsageSnapshot,
	evaluateSessionLimitWarning,
	formatCopilotTokenCount,
	mergeSessionUsageSnapshots,
	resolveCumulativeUsageTokens,
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

describe("resolveCumulativeUsageTokens", () => {
	it("takes the max across memory, config, and KV", () => {
		expect(
			resolveCumulativeUsageTokens({
				memory: 0,
				config: 12_000,
				kv: 40_000,
			}),
		).toBe(40_000);
	});

	it("survives a DO reset that only has the latest step in memory", () => {
		expect(
			resolveCumulativeUsageTokens({
				memory: 2_500,
				config: null,
				kv: 55_000,
			}),
		).toBe(55_000);
	});
});

describe("mergeSessionUsageSnapshots", () => {
	it("never decreases totalTokens within a conversation", () => {
		const previous = buildSessionUsageSnapshot({
			totalTokens: 40_000,
			messageCount: 4,
			creditsCharged: 2,
			creditBalance: 8,
		});
		const incoming = buildSessionUsageSnapshot({
			totalTokens: 3_000,
			messageCount: 5,
			creditsCharged: 1,
			creditBalance: 7,
		});
		const merged = mergeSessionUsageSnapshots(previous, incoming);
		expect(merged.totalTokens).toBe(40_000);
		expect(merged.creditsCharged).toBe(2);
		expect(merged.creditBalance).toBe(7);
		expect(merged.messageCount).toBe(5);
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
