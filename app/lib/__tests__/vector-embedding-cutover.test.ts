import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createMockEnv,
	createMockVectorize,
} from "../../test/helpers/mock-env";
import { sha256Hex } from "../crypto.server";
import {
	CARGO_EMBEDDING_FLAG,
	CLUSTER_PREFIX,
	CLUSTER_PREFIX_VERSION,
	EMBEDDING_DIMENSIONS,
	EMBEDDING_GEMMA_2_MODEL,
	EMBEDDING_GEMMA_2_THRESHOLDS,
	EMBEDDING_MODEL,
	type CargoVectorFloor,
	cargoEmbeddingCacheToken,
	deleteCargoVectors,
	embed,
	fillMissingCargoVectors,
	findSimilarCargoBatch,
	SIMILARITY_THRESHOLDS,
	upsertCargoVector,
} from "../vector.server";

function finiteVector(fill = 0.25): number[] {
	return Array.from({ length: EMBEDDING_DIMENSIONS }, () => fill);
}

function legacyShape(vec: number[] = finiteVector()) {
	return { shape: [1, 768], data: [vec] };
}

function gemma2Shape(
	vec: number[] = finiteVector(),
	model: string = EMBEDDING_GEMMA_2_MODEL,
) {
	return {
		model,
		data: [{ object: "embedding", index: 0, embedding: vec }],
		usage: { prompt_tokens: 3, total_tokens: 3 },
	};
}

function envFor(flagOn: boolean) {
	const env = createMockEnv();
	const legacy = createMockVectorize();
	const eg2 = createMockVectorize();
	env.VECTORIZE = legacy;
	(env as Env & { VECTORIZE_EG2?: VectorizeIndex }).VECTORIZE_EG2 = eg2;
	vi.mocked(env.FLAGS.getBooleanValue).mockImplementation(
		async (flag: string) => flagOn && flag === CARGO_EMBEDDING_FLAG,
	);
	env.RATION_KV = {
		...env.RATION_KV,
		get: vi.fn().mockResolvedValue(null),
		put: vi.fn().mockResolvedValue(undefined),
	} as KVNamespace;
	return { env, legacy, eg2 };
}

describe("cargo embedding parsers", () => {
	it("keeps the unflagged floors", () => {
		expect(SIMILARITY_THRESHOLDS.INGREDIENT_MATCH).toBe(0.78);
		expect(SIMILARITY_THRESHOLDS.CARGO_MERGE).toBe(0.78);
		expect(SIMILARITY_THRESHOLDS.CARGO_DEDUCTION).toBe(0.78);
		expect(EMBEDDING_GEMMA_2_THRESHOLDS.NAME_SEARCH_RECALL).toBe(0.6);
		expect(EMBEDDING_GEMMA_2_THRESHOLDS.DEFAULT_QUERY).toBe(0.82);
	});

	it("returns null for empty input", async () => {
		const ai = { run: vi.fn() } as unknown as Ai;
		await expect(embed(ai, "   ")).resolves.toBeNull();
		await expect(embed(ai, "")).resolves.toBeNull();
		expect(ai.run).not.toHaveBeenCalled();
	});

	it("accepts the legacy shape when the flag is off", async () => {
		const { env } = envFor(false);
		const vec = finiteVector(0.2);
		const ai = {
			run: vi.fn().mockResolvedValue(legacyShape(vec)),
		} as unknown as Ai;
		const result = await embed(ai, "Tomato", {
			env,
			organizationId: "org-verified",
			flagContext: { organizationId: "from-client", clientPlatform: "ios" },
		});
		expect(result).toEqual(vec);
		expect(ai.run).toHaveBeenCalledWith(EMBEDDING_MODEL, { text: ["Tomato"] });
		const context = vi.mocked(env.FLAGS.getBooleanValue).mock.calls[0]?.[2] as
			| { organizationId?: string }
			| undefined;
		expect(context?.organizationId).toBe("org-verified");
	});

	it("rejects the new shape when the flag is off", async () => {
		const { env } = envFor(false);
		const ai = {
			run: vi.fn().mockResolvedValue(gemma2Shape()),
		} as unknown as Ai;
		await expect(
			embed(ai, "Tomato", { env, organizationId: "org-1" }),
		).resolves.toBeNull();
	});

	it("accepts the new shape when the flag is on", async () => {
		const { env } = envFor(true);
		const vec = finiteVector(0.4);
		const ai = {
			run: vi.fn().mockResolvedValue(gemma2Shape(vec)),
		} as unknown as Ai;
		const result = await embed(ai, "  Tomato  ", {
			env,
			organizationId: "org-1",
		});
		expect(result).toEqual(vec);
		expect(ai.run).toHaveBeenCalledWith(EMBEDDING_GEMMA_2_MODEL, {
			input: [`${CLUSTER_PREFIX}Tomato`],
			dimensions: 768,
			encoding_format: "float",
		});
	});

	it("rejects the legacy shape, a wrong length, a non-finite value, and the wrong model", async () => {
		const { env } = envFor(true);
		const run = { env, organizationId: "org-1" };
		const ai = { run: vi.fn() } as unknown as Ai;

		vi.mocked(ai.run).mockResolvedValueOnce(legacyShape());
		await expect(embed(ai, "Tomato", run)).resolves.toBeNull();

		const short = finiteVector().slice(0, 512);
		vi.mocked(ai.run).mockResolvedValueOnce(gemma2Shape(short));
		await expect(embed(ai, "Tomato", run)).resolves.toBeNull();

		const nonFinite = finiteVector();
		nonFinite[3] = Number.NaN;
		vi.mocked(ai.run).mockResolvedValueOnce(gemma2Shape(nonFinite));
		await expect(embed(ai, "Tomato", run)).resolves.toBeNull();

		const infinite = finiteVector();
		infinite[1] = Number.POSITIVE_INFINITY;
		vi.mocked(ai.run).mockResolvedValueOnce(gemma2Shape(infinite));
		await expect(embed(ai, "Tomato", run)).resolves.toBeNull();

		vi.mocked(ai.run).mockResolvedValueOnce(
			gemma2Shape(finiteVector(), EMBEDDING_MODEL),
		);
		await expect(embed(ai, "Tomato", run)).resolves.toBeNull();
	});
});

describe("cargo embedding flag paths", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("uses the vec: key and ration-cargo when the flag is off", async () => {
		const { env, legacy, eg2 } = envFor(false);
		const vec = finiteVector();
		env.AI = {
			run: vi.fn().mockResolvedValue(legacyShape(vec)),
		} as unknown as Ai;
		vi.mocked(legacy.query).mockResolvedValue({
			matches: [
				{
					id: "cargo-1",
					score: 0.9,
					metadata: { name: "Tomato" },
				},
			],
			count: 1,
		});

		const matches = await findSimilarCargoBatch(env, "org-1", ["Tomato"]);
		expect(matches.get("Tomato")?.[0]?.itemId).toBe("cargo-1");
		expect(legacy.query).toHaveBeenCalledTimes(1);
		expect(eg2.query).not.toHaveBeenCalled();
		expect(eg2.upsert).not.toHaveBeenCalled();

		const hash = await sha256Hex("Tomato");
		const keys = vi.mocked(env.RATION_KV.get).mock.calls.map((call) => call[0]);
		expect(keys).toContain(`vec:${hash}`);
		expect(keys.some((key) => String(key).includes(EMBEDDING_GEMMA_2_MODEL))).toBe(
			false,
		);
		expect(env.AI.run).toHaveBeenCalledWith(EMBEDDING_MODEL, {
			text: ["Tomato"],
		});
	});

	it("uses the new key and the new index when the flag is on", async () => {
		const { env, legacy, eg2 } = envFor(true);
		const vec = finiteVector(0.3);
		env.AI = {
			run: vi.fn().mockResolvedValue(gemma2Shape(vec)),
		} as unknown as Ai;
		vi.mocked(eg2.query).mockResolvedValue({ matches: [], count: 0 });

		await findSimilarCargoBatch(env, "org-1", ["Tomato"], {
			floor: "ingredient" satisfies CargoVectorFloor,
		});

		expect(legacy.query).not.toHaveBeenCalled();
		expect(eg2.query).toHaveBeenCalledTimes(1);
		expect(env.AI.run).toHaveBeenCalledWith(EMBEDDING_GEMMA_2_MODEL, {
			input: [`${CLUSTER_PREFIX}Tomato`],
			dimensions: 768,
			encoding_format: "float",
		});

		const hash = await sha256Hex("Tomato");
		const expectedKey = `vec:${EMBEDDING_GEMMA_2_MODEL}:${EMBEDDING_DIMENSIONS}:${CLUSTER_PREFIX_VERSION}:${hash}`;
		const keys = vi.mocked(env.RATION_KV.get).mock.calls.map((call) => call[0]);
		expect(keys).toContain(expectedKey);
		expect(keys).not.toContain(`vec:${hash}`);
		expect(await cargoEmbeddingCacheToken(env, "org-1")).toBe(
			EMBEDDING_GEMMA_2_MODEL,
		);
	});

	it("does not throw when lazy fill cannot read or write the new index", async () => {
		const { env, legacy, eg2 } = envFor(true);
		env.AI = {
			run: vi.fn().mockResolvedValue(gemma2Shape()),
		} as unknown as Ai;
		vi.mocked(eg2.getByIds).mockRejectedValueOnce(new Error("getByIds down"));

		await expect(
			fillMissingCargoVectors(env, "org-1", [
				{ id: "cargo-1", name: "Tomato", domain: "food" },
			]),
		).resolves.toBeUndefined();
		expect(eg2.upsert).not.toHaveBeenCalled();
		expect(legacy.upsert).not.toHaveBeenCalled();

		vi.mocked(eg2.getByIds).mockResolvedValueOnce([]);
		vi.mocked(eg2.upsert).mockRejectedValueOnce(new Error("upsert down"));
		await expect(
			fillMissingCargoVectors(env, "org-1", [
				{ id: "cargo-1", name: "Tomato", domain: "food" },
			]),
		).resolves.toBeUndefined();
		expect(legacy.upsert).not.toHaveBeenCalled();
	});

	it("fills only a resolved cargo id that is missing from the new index", async () => {
		const { env, legacy, eg2 } = envFor(true);
		env.AI = {
			run: vi.fn().mockResolvedValue(gemma2Shape(finiteVector(0.5))),
		} as unknown as Ai;
		vi.mocked(eg2.getByIds).mockResolvedValue([{ id: "already", values: [0] }]);

		await fillMissingCargoVectors(env, "org-1", [
			{ id: "already", name: "Salt", domain: "food" },
			{ id: "missing", name: "Tomato", domain: "food" },
			{ id: "", name: "free text", domain: "food" },
		]);

		expect(eg2.upsert).toHaveBeenCalledTimes(1);
		const rows = vi.mocked(eg2.upsert).mock.calls[0]?.[0] as Array<{
			id: string;
		}>;
		expect(rows.map((row) => row.id)).toEqual(["missing"]);
		expect(legacy.upsert).not.toHaveBeenCalled();
		expect(env.RATION_KV.get).not.toHaveBeenCalled();
	});

	it("does not query-fill from findSimilarCargoBatch", async () => {
		const { env, eg2 } = envFor(true);
		env.AI = {
			run: vi.fn().mockResolvedValue(gemma2Shape()),
		} as unknown as Ai;
		await findSimilarCargoBatch(env, "org-1", ["cherry tomatoes"]);
		expect(eg2.upsert).not.toHaveBeenCalled();
		expect(eg2.getByIds).not.toHaveBeenCalled();
	});

	it("writes a flagged upsert only to the new index", async () => {
		const { env, legacy, eg2 } = envFor(true);
		env.AI = {
			run: vi.fn().mockResolvedValue(gemma2Shape()),
		} as unknown as Ai;
		await upsertCargoVector(env, "org-1", {
			id: "cargo-9",
			name: "Tomato",
			domain: "food",
		});
		expect(eg2.upsert).toHaveBeenCalledTimes(1);
		expect(legacy.upsert).not.toHaveBeenCalled();
		expect(env.RATION_KV.get).not.toHaveBeenCalled();
	});

	it("deletes an id from both indexes", async () => {
		const { env, legacy, eg2 } = envFor(false);
		await deleteCargoVectors(env, ["cargo-1"]);
		expect(legacy.deleteByIds).toHaveBeenCalledWith(["cargo-1"]);
		expect(eg2.deleteByIds).toHaveBeenCalledWith(["cargo-1"]);
	});

	it("uses the new-path floor constant when floor is set and the flag is on", async () => {
		const { env, eg2 } = envFor(true);
		env.AI = {
			run: vi.fn().mockResolvedValue(gemma2Shape()),
		} as unknown as Ai;
		const floor = EMBEDDING_GEMMA_2_THRESHOLDS.INGREDIENT_MATCH;
		vi.mocked(eg2.query).mockResolvedValue({
			matches: [
				{ id: "low", score: floor - 0.01, metadata: { name: "Low" } },
				{ id: "ok", score: floor, metadata: { name: "Ok" } },
			],
			count: 2,
		});
		const matches = await findSimilarCargoBatch(env, "org-1", ["Tomato"], {
			floor: "ingredient",
		});
		expect(matches.get("Tomato")?.map((match) => match.itemId)).toEqual(["ok"]);
	});
});
