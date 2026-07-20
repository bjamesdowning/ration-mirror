import { describe, expect, it, vi } from "vitest";
import {
	createMockEnv,
	createMockVectorize,
} from "../../test/helpers/mock-env";
import {
	findSimilarCargoBatch,
	VECTORIZE_QUERY_CONCURRENCY,
} from "../vector.server";

vi.mock("../crypto.server", () => ({
	sha256Hex: vi.fn(async (text: string) => `hash:${text}`),
}));

describe("findSimilarCargoBatch concurrency", () => {
	it("bounds peak parallel Vectorize queries to VECTORIZE_QUERY_CONCURRENCY", async () => {
		expect(VECTORIZE_QUERY_CONCURRENCY).toBe(12);

		let inFlight = 0;
		let peak = 0;
		const vectorize = createMockVectorize();
		vi.mocked(vectorize.query).mockImplementation(async () => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise((r) => setTimeout(r, 5));
			inFlight--;
			return { matches: [], count: 0 };
		});

		const env = createMockEnv();
		env.VECTORIZE = vectorize;
		env.AI = {
			run: vi.fn().mockResolvedValue({
				data: Array.from({ length: 50 }, () => Array(768).fill(0.1)),
			}),
		} as unknown as Ai;
		env.RATION_KV = {
			...env.RATION_KV,
			get: vi.fn().mockResolvedValue(null),
			put: vi.fn().mockResolvedValue(undefined),
		} as KVNamespace;

		const names = Array.from({ length: 50 }, (_, i) => `ingredient-${i}`);
		await findSimilarCargoBatch(env, "org_1", names);

		expect(vectorize.query).toHaveBeenCalledTimes(50);
		expect(peak).toBeLessThanOrEqual(VECTORIZE_QUERY_CONCURRENCY);
		expect(peak).toBeGreaterThan(1);
	});
});

describe("deleteCargoVectors", () => {
	it("rethrows Vectorize delete failures (GDPR fail-closed)", async () => {
		const { deleteCargoVectors } = await import("../vector.server");
		const vectorize = createMockVectorize();
		vi.mocked(vectorize.deleteByIds).mockRejectedValue(
			new Error("vectorize unavailable"),
		);
		const env = createMockEnv();
		env.VECTORIZE = vectorize;

		await expect(deleteCargoVectors(env, ["cargo-1"])).rejects.toThrow(
			/vectorize unavailable/,
		);
	});

	it("no-ops when VECTORIZE binding is absent", async () => {
		const { deleteCargoVectors } = await import("../vector.server");
		const env = createMockEnv();
		env.VECTORIZE = undefined as unknown as VectorizeIndex;
		await expect(deleteCargoVectors(env, ["cargo-1"])).resolves.toBeUndefined();
	});
});
