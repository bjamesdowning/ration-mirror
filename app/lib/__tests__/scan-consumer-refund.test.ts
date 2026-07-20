import { afterEach, describe, expect, it, vi } from "vitest";

const updateQueueJobResult = vi.fn().mockResolvedValue(true);
const fetchOrgCargoIndex = vi.fn().mockResolvedValue([]);
const storageGet = vi.fn().mockResolvedValue(null);
const storageDelete = vi.fn().mockResolvedValue(undefined);
const failAiJobWithRefund = vi.fn(
	async (options: { writeStatus: () => Promise<boolean> }) => {
		await options.writeStatus();
	},
);

vi.mock("~/lib/queue-job.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../queue-job.server")>();
	return {
		...actual,
		updateQueueJobResult: (...args: unknown[]) => updateQueueJobResult(...args),
		runIdempotentAiJob: async (
			_db: unknown,
			_requestId: string,
			work: () => Promise<void>,
		) => {
			await work();
			return { ran: true, claimed: true };
		},
		// Avoid D1 artifact read/write in this test; pass through to Gateway.
		callGeminiWithArtifact: async (
			env: Cloudflare.Env,
			_requestId: string,
			options: Parameters<typeof actual.callGeminiWithArtifact>[2],
		) => {
			const { callGemini } = await import("../ai-gateway.server");
			return callGemini(env, options);
		},
	};
});

vi.mock("~/lib/cargo-index.server", () => ({
	fetchOrgCargoIndex: (...args: unknown[]) => fetchOrgCargoIndex(...args),
}));

vi.mock("~/lib/ledger.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../ledger.server")>();
	return {
		...actual,
		failAiJobWithRefund: (
			_env: Cloudflare.Env,
			options: Parameters<typeof actual.failAiJobWithRefund>[1],
		) => failAiJobWithRefund(options),
	};
});

const baseEnv = {
	DB: {},
	STORAGE: {
		get: storageGet,
		delete: storageDelete,
	},
	AI_GATEWAY_ACCOUNT_ID: "acct",
	AI_GATEWAY_ID: "gw",
	CF_AIG_TOKEN: "token",
} as unknown as Cloudflare.Env;

describe("runScanConsumerJob refund on failure", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		storageGet.mockResolvedValue(null);
		storageDelete.mockResolvedValue(undefined);
		fetchOrgCargoIndex.mockResolvedValue([]);
	});

	it("writes failed status and triggers async credit refund", async () => {
		const { runScanConsumerJob } = await import("../scan-consumer.server");

		await runScanConsumerJob(baseEnv, {
			requestId: "req_scan_1",
			organizationId: "org_1",
			userId: "user_1",
			imageKey: "missing.jpg",
			mimeType: "image/jpeg",
			cost: 2,
		});

		expect(updateQueueJobResult).toHaveBeenCalledWith(
			baseEnv.DB,
			"req_scan_1",
			"failed",
			expect.objectContaining({
				status: "failed",
				error: "We couldn't find your upload. Please try scanning again.",
			}),
		);
		expect(failAiJobWithRefund).toHaveBeenCalledWith(
			expect.objectContaining({
				requestId: "req_scan_1",
				organizationId: "org_1",
				userId: "user_1",
				cost: 2,
				reason: "Visual Scan",
			}),
		);
	});

	it("keeps completed status when scan image cleanup fails", async () => {
		storageGet.mockResolvedValueOnce({
			arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
		});
		storageDelete.mockRejectedValueOnce(new Error("R2 unavailable"));
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					candidates: [
						{
							content: {
								parts: [
									{
										text: JSON.stringify({
											items: [
												{
													name: "milk",
													quantity: 1,
													unit: "unit",
													tags: ["dairy"],
													expiresAt: null,
													confidence: 0.9,
												},
											],
										}),
									},
								],
							},
						},
					],
				}),
			}),
		);

		const { runScanConsumerJob } = await import("../scan-consumer.server");

		await runScanConsumerJob(baseEnv, {
			requestId: "req_scan_2",
			organizationId: "org_1",
			userId: "user_1",
			imageKey: "scan.jpg",
			mimeType: "image/jpeg",
			cost: 2,
		});

		expect(updateQueueJobResult).toHaveBeenCalledTimes(1);
		expect(updateQueueJobResult).toHaveBeenCalledWith(
			baseEnv.DB,
			"req_scan_2",
			"completed",
			expect.objectContaining({
				status: "completed",
				items: expect.arrayContaining([
					expect.objectContaining({ name: "milk" }),
				]),
			}),
		);
		expect(failAiJobWithRefund).not.toHaveBeenCalled();
	});
});
