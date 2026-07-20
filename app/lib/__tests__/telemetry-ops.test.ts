import { describe, expect, it, vi } from "vitest";
import { runWithOpsEnv } from "~/lib/ops-context.server";
import {
	emitApiOutcome,
	emitGeminiInvoke,
	emitQueueConsumerError,
	emitRateLimitDenied,
	writeOpsDataPoint,
} from "~/lib/telemetry.server";

function createMockAnalytics() {
	return {
		writeDataPoint: vi.fn(),
	} as unknown as AnalyticsEngineDataset;
}

describe("writeOpsDataPoint", () => {
	it("writes low-cardinality blobs and route index", () => {
		const analytics = createMockAnalytics();
		writeOpsDataPoint(analytics, {
			route: "api",
			blobs: ["503", "server_busy"],
		});
		expect(analytics.writeDataPoint).toHaveBeenCalledWith({
			indexes: ["api"],
			blobs: ["503", "server_busy"],
			doubles: [1],
		});
	});

	it("no-ops when analytics binding is absent", () => {
		expect(() =>
			writeOpsDataPoint(undefined, {
				route: "api",
				blobs: ["503"],
			}),
		).not.toThrow();
	});

	it("swallows writeDataPoint errors", () => {
		const analytics = {
			writeDataPoint: vi.fn(() => {
				throw new Error("ae down");
			}),
		} as unknown as AnalyticsEngineDataset;
		expect(() =>
			writeOpsDataPoint(analytics, { route: "api", blobs: ["5xx"] }),
		).not.toThrow();
	});

	it("never includes raw emails or secrets in payloads", () => {
		const analytics = createMockAnalytics();
		writeOpsDataPoint(analytics, {
			route: "rate_limit",
			blobs: ["429", "scan", "fail_closed"],
			doubles: [1],
		});
		const arg = vi.mocked(analytics.writeDataPoint).mock.calls[0]?.[0] as {
			blobs: string[];
			indexes: string[];
		};
		const serialized = JSON.stringify(arg);
		expect(serialized).not.toMatch(/@/);
		expect(serialized).not.toMatch(/sk_/);
		expect(serialized).not.toMatch(/Bearer /);
	});
});

describe("emitOpsMetric via ALS", () => {
	it("emits through runWithOpsEnv binding", () => {
		const analytics = createMockAnalytics();
		runWithOpsEnv({ RATION_ANALYTICS: analytics }, () => {
			emitApiOutcome("503", "server_busy");
			emitRateLimitDenied("scan", "fail_closed");
			emitQueueConsumerError("ration-scan");
			emitGeminiInvoke("scan", true);
		});
		expect(analytics.writeDataPoint).toHaveBeenCalledTimes(4);
		expect(analytics.writeDataPoint).toHaveBeenCalledWith(
			expect.objectContaining({
				indexes: ["api"],
				blobs: ["503", "server_busy"],
			}),
		);
		expect(analytics.writeDataPoint).toHaveBeenCalledWith(
			expect.objectContaining({
				indexes: ["rate_limit"],
				blobs: ["429", "scan", "fail_closed"],
			}),
		);
		expect(analytics.writeDataPoint).toHaveBeenCalledWith(
			expect.objectContaining({
				indexes: ["queue_consumer"],
				blobs: ["5xx", "queue_retry", "ration-scan"],
			}),
		);
		expect(analytics.writeDataPoint).toHaveBeenCalledWith(
			expect.objectContaining({
				indexes: ["gemini"],
				blobs: ["gemini_invoke", "scan"],
			}),
		);
	});

	it("no-ops when ALS env is unbound", () => {
		expect(() => emitApiOutcome("503")).not.toThrow();
	});
});
