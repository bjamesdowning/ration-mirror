import { afterEach, describe, expect, it, vi } from "vitest";

const updateQueueJobResult = vi.fn().mockResolvedValue(true);

vi.mock("~/lib/queue-job.server", () => ({
	updateQueueJobResult: (...args: unknown[]) => updateQueueJobResult(...args),
	patchQueueJobProgress: vi.fn().mockResolvedValue(true),
	runIdempotentAiJob: async (
		_db: unknown,
		_requestId: string,
		work: () => Promise<void>,
	) => {
		await work();
		return { ran: true, claimed: true };
	},
}));

vi.mock("~/lib/ledger.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../ledger.server")>();
	return {
		...actual,
		failAiJobWithRefund: async (
			_env: Cloudflare.Env,
			options: { writeStatus: () => Promise<boolean> },
		) => {
			await options.writeStatus();
		},
	};
});

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => [],
				}),
			}),
		}),
	}),
}));

const baseEnv = {
	DB: {},
	AI_GATEWAY_ACCOUNT_ID: "acct",
	AI_GATEWAY_ID: "gw",
	CF_AIG_TOKEN: "token",
} as unknown as Cloudflare.Env;

describe("runImportUrlConsumerJob SSRF redirect re-check", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		updateQueueJobResult.mockReset();
	});

	it("does not ingest redirected private content; saves holder for the original URL", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				url: "http://127.0.0.1/secret",
				ok: true,
				headers: new Headers({ "Content-Type": "text/html" }),
				text: async () => "<html>recipe</html>",
			}),
		);

		const { runImportUrlConsumerJob } = await import(
			"../import-url-consumer.server"
		);

		await runImportUrlConsumerJob(baseEnv, {
			requestId: "req_1",
			organizationId: "org_1",
			userId: "user_1",
			url: "https://example.com/recipe",
			cost: 3,
		});

		// Private redirect is rejected before AI; never-empty path holds the
		// original submitted HTTPS URL (not 127.0.0.1).
		expect(updateQueueJobResult).toHaveBeenCalledWith(
			baseEnv.DB,
			"req_1",
			"completed",
			expect.objectContaining({
				success: true,
				completeness: "link_holder",
				sourceUrl: "https://example.com/recipe",
			}),
		);
	});
});
