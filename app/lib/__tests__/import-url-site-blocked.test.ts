import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPageContentFromHtml } from "~/lib/import-url-consumer.server";
import {
	SITE_BLOCKED_CODE,
	SITE_BLOCKED_MESSAGE,
} from "~/lib/recipe-import-block.server";
import { createMockR2 } from "~/test/helpers/mock-env";

const updateQueueJobResult = vi.fn().mockResolvedValue(true);

vi.mock("~/lib/queue-job.server", () => ({
	updateQueueJobResult: (...args: unknown[]) => updateQueueJobResult(...args),
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

function createMemoryKV(): KVNamespace {
	const store = new Map<string, string>();
	return {
		get: (async (key: string) => store.get(key) ?? null) as KVNamespace["get"],
		put: (async (key: string, value: string) => {
			store.set(key, value);
		}) as KVNamespace["put"],
		delete: (async (key: string) => {
			store.delete(key);
		}) as KVNamespace["delete"],
		getWithMetadata: async () => ({ value: null, metadata: null }),
		list: async () => ({ keys: [], list_complete: true, cursor: "" }),
	} as unknown as KVNamespace;
}

function createMemoryR2(initial?: Record<string, string>): R2Bucket {
	const store = new Map<string, string>(Object.entries(initial ?? {}));
	return {
		get: async (key: string) => {
			const value = store.get(key);
			if (value == null) return null;
			return {
				text: async () => value,
			};
		},
		put: async (key: string, value: string | ArrayBuffer | ReadableStream) => {
			store.set(key, typeof value === "string" ? value : String(value));
		},
		delete: async (key: string | string[]) => {
			for (const k of Array.isArray(key) ? key : [key]) {
				store.delete(k);
			}
		},
		head: async () => null,
		list: async () => ({ objects: [], truncated: false }),
		createMultipartUpload: vi.fn(),
		resumeMultipartUpload: vi.fn(),
	} as unknown as R2Bucket;
}

describe("buildPageContentFromHtml", () => {
	it("fails fast on People Inc access pages", () => {
		const html = `
			<p>If you are a reader experiencing an access issue, please contact
			support@people.inc</p>`;
		const result = buildPageContentFromHtml(html, "plain_fetch");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe(SITE_BLOCKED_CODE);
			expect(result.error).toBe(SITE_BLOCKED_MESSAGE);
		}
	});

	it("accepts recipe JSON-LD", () => {
		const html = `<html><script type="application/ld+json">{"@type":"Recipe","name":"Soup"}</script></html>`;
		const result = buildPageContentFromHtml(html, "client");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.content).toContain("recipe_json_ld");
			expect(result.source).toBe("client");
		}
	});
});

describe("runImportUrlConsumerJob SITE_BLOCKED on 402", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		updateQueueJobResult.mockReset();
	});

	it("returns SITE_BLOCKED when remote fetch returns 402", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				url: "https://www.allrecipes.com/recipe/14430/simple-potato-salad/",
				ok: false,
				status: 402,
				headers: new Headers({ "Content-Type": "text/html" }),
				text: async () =>
					"<p>If you are a reader experiencing an access issue, please contact support@people.inc</p>",
			}),
		);

		const { runImportUrlConsumerJob } = await import(
			"../import-url-consumer.server"
		);

		const env = {
			DB: {},
			RATION_KV: createMemoryKV(),
			STORAGE: createMockR2(),
			AI_GATEWAY_ACCOUNT_ID: "acct",
			AI_GATEWAY_ID: "gw",
			CF_AIG_TOKEN: "token",
		} as unknown as Cloudflare.Env;

		await runImportUrlConsumerJob(env, {
			requestId: "req_402",
			organizationId: "org_1",
			userId: "user_1",
			url: "https://www.allrecipes.com/recipe/14430/simple-potato-salad/",
			cost: 1,
		});

		expect(updateQueueJobResult).toHaveBeenCalledWith(
			env.DB,
			"req_402",
			"failed",
			expect.objectContaining({
				success: false,
				code: SITE_BLOCKED_CODE,
				error: SITE_BLOCKED_MESSAGE,
			}),
		);
	});
});

describe("runImportUrlConsumerJob client HTML from R2", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		updateQueueJobResult.mockReset();
	});

	it("fails SITE_BLOCKED for client access-page HTML without calling fetch", async () => {
		const accessHtml =
			"<p>If you are a reader experiencing an access issue, please contact support@people.inc. Include your IP from icanhazip.com for licensing at contentlicensing@people.inc.</p>";
		const r2 = createMemoryR2({
			"import-page/req_client": accessHtml,
		});

		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const { runImportUrlConsumerJob } = await import(
			"../import-url-consumer.server"
		);

		const env = {
			DB: {},
			RATION_KV: createMemoryKV(),
			STORAGE: r2,
			AI_GATEWAY_ACCOUNT_ID: "acct",
			AI_GATEWAY_ID: "gw",
			CF_AIG_TOKEN: "token",
		} as unknown as Cloudflare.Env;

		await runImportUrlConsumerJob(env, {
			requestId: "req_client",
			organizationId: "org_1",
			userId: "user_1",
			url: "https://www.allrecipes.com/recipe/1/",
			cost: 1,
			contentSource: "client",
		});

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(updateQueueJobResult).toHaveBeenCalledWith(
			env.DB,
			"req_client",
			"failed",
			expect.objectContaining({
				code: SITE_BLOCKED_CODE,
			}),
		);
	});
});
