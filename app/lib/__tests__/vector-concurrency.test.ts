import { describe, expect, it, vi } from "vitest";
import {
	createMockEnv,
	createMockVectorize,
} from "../../test/helpers/mock-env";
import {
	findSimilarCargoBatch,
	VECTORIZE_DELETE_BY_IDS_MAX,
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

	it("sends exactly VECTORIZE_DELETE_BY_IDS_MAX ids in one call", async () => {
		expect(VECTORIZE_DELETE_BY_IDS_MAX).toBe(100);
		const { deleteCargoVectors } = await import("../vector.server");
		const vectorize = createMockVectorize();
		const env = createMockEnv();
		env.VECTORIZE = vectorize;
		const ids = Array.from(
			{ length: VECTORIZE_DELETE_BY_IDS_MAX },
			(_, i) => `cargo-${i}`,
		);

		await deleteCargoVectors(env, ids);

		expect(vectorize.deleteByIds).toHaveBeenCalledTimes(1);
		expect(vectorize.deleteByIds).toHaveBeenCalledWith(ids);
	});

	it("chunks 101 ids into 100 then 1", async () => {
		const { deleteCargoVectors } = await import("../vector.server");
		const vectorize = createMockVectorize();
		const env = createMockEnv();
		env.VECTORIZE = vectorize;
		const ids = Array.from({ length: 101 }, (_, i) => `cargo-${i}`);

		await deleteCargoVectors(env, ids);

		expect(vectorize.deleteByIds).toHaveBeenCalledTimes(2);
		expect(vi.mocked(vectorize.deleteByIds).mock.calls[0][0]).toHaveLength(100);
		expect(vi.mocked(vectorize.deleteByIds).mock.calls[1][0]).toHaveLength(1);
		expect(vi.mocked(vectorize.deleteByIds).mock.calls[0][0][0]).toBe(
			"cargo-0",
		);
		expect(vi.mocked(vectorize.deleteByIds).mock.calls[1][0][0]).toBe(
			"cargo-100",
		);
	});

	it("chunks the production 154-id payload into 100 then 54", async () => {
		const { deleteCargoVectors } = await import("../vector.server");
		const vectorize = createMockVectorize();
		const env = createMockEnv();
		env.VECTORIZE = vectorize;
		const ids = Array.from({ length: 154 }, (_, i) => `cargo-${i}`);

		await deleteCargoVectors(env, ids);

		expect(vectorize.deleteByIds).toHaveBeenCalledTimes(2);
		expect(vi.mocked(vectorize.deleteByIds).mock.calls[0][0]).toHaveLength(100);
		expect(vi.mocked(vectorize.deleteByIds).mock.calls[1][0]).toHaveLength(54);
	});

	it("stops on the first chunk failure (GDPR fail-closed)", async () => {
		const { deleteCargoVectors } = await import("../vector.server");
		const vectorize = createMockVectorize();
		vi.mocked(vectorize.deleteByIds)
			.mockResolvedValueOnce({ ids: [], count: 0 })
			.mockRejectedValueOnce(new Error("VECTOR_DELETE_ERROR"));
		const env = createMockEnv();
		env.VECTORIZE = vectorize;
		const ids = Array.from({ length: 154 }, (_, i) => `cargo-${i}`);

		await expect(deleteCargoVectors(env, ids)).rejects.toThrow(
			/VECTOR_DELETE_ERROR/,
		);
		expect(vectorize.deleteByIds).toHaveBeenCalledTimes(2);
	});
});
