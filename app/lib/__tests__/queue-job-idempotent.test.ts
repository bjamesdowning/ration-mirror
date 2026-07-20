import { describe, expect, it, vi } from "vitest";
import {
	callGeminiWithArtifact,
	isTerminalQueueJobStatus,
	runIdempotentAiJob,
	toClientQueueJobStatus,
} from "../queue-job.server";

const getQueueJob = vi.fn();
const claimQueueJobForProcessing = vi.fn();
const deps = { getQueueJob, claimQueueJobForProcessing };

describe("toClientQueueJobStatus", () => {
	it("maps processing to pending for poll clients", () => {
		expect(toClientQueueJobStatus("processing")).toBe("pending");
		expect(toClientQueueJobStatus("pending")).toBe("pending");
		expect(toClientQueueJobStatus("completed")).toBe("completed");
		expect(toClientQueueJobStatus("failed")).toBe("failed");
	});
});

describe("isTerminalQueueJobStatus", () => {
	it("recognizes completed and failed only", () => {
		expect(isTerminalQueueJobStatus("completed")).toBe(true);
		expect(isTerminalQueueJobStatus("failed")).toBe(true);
		expect(isTerminalQueueJobStatus("pending")).toBe(false);
		expect(isTerminalQueueJobStatus("processing")).toBe(false);
	});
});

describe("callGeminiWithArtifact", () => {
	it("skips Gemini when a model artifact already exists", async () => {
		const callGemini = vi.fn();
		const saveQueueJobModelArtifact = vi.fn();
		const getJob = vi.fn().mockResolvedValue({
			status: "processing",
			organizationId: "org_1",
			resultJson: null,
			modelArtifact: '{"items":[]}',
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
		});

		const result = await callGeminiWithArtifact(
			{ DB: {} } as Env,
			"req_artifact",
			{
				feature: "scan",
				parts: [{ text: "prompt" }],
				metadata: { organizationId: "org_1", userId: "user_1" },
			},
			{
				getQueueJob: getJob,
				saveQueueJobModelArtifact,
				callGemini,
			},
		);

		expect(result).toEqual({ ok: true, text: '{"items":[]}' });
		expect(callGemini).not.toHaveBeenCalled();
		expect(saveQueueJobModelArtifact).not.toHaveBeenCalled();
	});

	it("invokes Gemini and persists artifact on first success", async () => {
		const callGemini = vi.fn().mockResolvedValue({
			ok: true,
			text: "model-output",
		});
		const saveQueueJobModelArtifact = vi.fn().mockResolvedValue(true);
		const getJob = vi.fn().mockResolvedValue({
			status: "processing",
			organizationId: "org_1",
			resultJson: null,
			modelArtifact: null,
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
		});

		const result = await callGeminiWithArtifact(
			{ DB: {} } as Env,
			"req_fresh",
			{
				feature: "scan",
				parts: [{ text: "prompt" }],
				metadata: { organizationId: "org_1", userId: "user_1" },
			},
			{
				getQueueJob: getJob,
				saveQueueJobModelArtifact,
				callGemini,
			},
		);

		expect(result).toEqual({ ok: true, text: "model-output" });
		expect(callGemini).toHaveBeenCalledTimes(1);
		expect(saveQueueJobModelArtifact).toHaveBeenCalledWith(
			{},
			"req_fresh",
			"model-output",
		);
	});

	it("forceRefresh bypasses an existing artifact", async () => {
		const callGemini = vi.fn().mockResolvedValue({
			ok: true,
			text: "br-output",
		});
		const prepareRun = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
		const prepare = vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnValue({ run: prepareRun }),
		});
		const getJob = vi.fn();

		const result = await callGeminiWithArtifact(
			{ DB: { prepare } } as unknown as Env,
			"req_force",
			{
				feature: "import_url",
				parts: [{ text: "prompt" }],
				metadata: { organizationId: "org_1", userId: "user_1" },
			},
			{
				getQueueJob: getJob,
				saveQueueJobModelArtifact: vi.fn(),
				callGemini,
			},
			{ forceRefresh: true },
		);

		expect(result).toEqual({ ok: true, text: "br-output" });
		expect(getJob).not.toHaveBeenCalled();
		expect(callGemini).toHaveBeenCalledTimes(1);
		expect(prepare).toHaveBeenCalled();
	});
});

describe("runIdempotentAiJob", () => {
	it("skips work when job is already completed", async () => {
		getQueueJob.mockResolvedValueOnce({
			status: "completed",
			organizationId: "org_1",
			resultJson: "{}",
			modelArtifact: null,
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
		});
		const work = vi.fn();

		const outcome = await runIdempotentAiJob(
			{} as D1Database,
			"req_1",
			work,
			deps,
		);

		expect(outcome).toEqual({ ran: false, reason: "terminal" });
		expect(work).not.toHaveBeenCalled();
		expect(claimQueueJobForProcessing).not.toHaveBeenCalled();
	});

	it("skips work when job is already failed", async () => {
		getQueueJob.mockResolvedValueOnce({
			status: "failed",
			organizationId: "org_1",
			resultJson: "{}",
			modelArtifact: null,
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
		});
		const work = vi.fn();

		const outcome = await runIdempotentAiJob(
			{} as D1Database,
			"req_2",
			work,
			deps,
		);

		expect(outcome).toEqual({ ran: false, reason: "terminal" });
		expect(work).not.toHaveBeenCalled();
	});

	it("throws when job is missing so the queue can retry", async () => {
		getQueueJob.mockResolvedValueOnce(null);
		const work = vi.fn();

		await expect(
			runIdempotentAiJob({} as D1Database, "req_3", work, deps),
		).rejects.toThrow(/missing or expired/);
		expect(work).not.toHaveBeenCalled();
	});

	it("claims pending jobs and runs work", async () => {
		getQueueJob.mockResolvedValueOnce({
			status: "pending",
			organizationId: "org_1",
			resultJson: null,
			modelArtifact: null,
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
		});
		claimQueueJobForProcessing.mockResolvedValueOnce(true);
		const work = vi.fn().mockResolvedValue(undefined);

		const outcome = await runIdempotentAiJob(
			{} as D1Database,
			"req_4",
			work,
			deps,
		);

		expect(outcome).toEqual({ ran: true, claimed: true });
		expect(claimQueueJobForProcessing).toHaveBeenCalledWith({}, "req_4");
		expect(work).toHaveBeenCalledTimes(1);
	});

	it("re-checks terminal status when claim loses a race", async () => {
		getQueueJob
			.mockResolvedValueOnce({
				status: "pending",
				organizationId: "org_1",
				resultJson: null,
				modelArtifact: null,
				expiresAt: Math.floor(Date.now() / 1000) + 3600,
			})
			.mockResolvedValueOnce({
				status: "completed",
				organizationId: "org_1",
				resultJson: "{}",
				modelArtifact: null,
				expiresAt: Math.floor(Date.now() / 1000) + 3600,
			});
		claimQueueJobForProcessing.mockResolvedValueOnce(false);
		const work = vi.fn();

		const outcome = await runIdempotentAiJob(
			{} as D1Database,
			"req_5",
			work,
			deps,
		);

		expect(outcome).toEqual({ ran: false, reason: "terminal" });
		expect(work).not.toHaveBeenCalled();
	});

	it("runs work on processing re-entry when claim fails but job is not terminal", async () => {
		getQueueJob
			.mockResolvedValueOnce({
				status: "processing",
				organizationId: "org_1",
				resultJson: null,
				modelArtifact: null,
				expiresAt: Math.floor(Date.now() / 1000) + 3600,
			})
			.mockResolvedValueOnce({
				status: "processing",
				organizationId: "org_1",
				resultJson: null,
				modelArtifact: null,
				expiresAt: Math.floor(Date.now() / 1000) + 3600,
			});
		claimQueueJobForProcessing.mockResolvedValueOnce(false);
		const work = vi.fn().mockResolvedValue(undefined);

		const outcome = await runIdempotentAiJob(
			{} as D1Database,
			"req_6",
			work,
			deps,
		);

		expect(outcome).toEqual({ ran: true, claimed: false });
		expect(work).toHaveBeenCalledTimes(1);
	});
});
