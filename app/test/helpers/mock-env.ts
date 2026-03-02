import { vi } from "vitest";

/**
 * Stub KV namespace for testing. All methods return sensible defaults.
 */
export function createMockKV(): KVNamespace {
	return {
		get: vi.fn().mockResolvedValue(null),
		getWithMetadata: vi.fn().mockResolvedValue({ value: null, metadata: null }),
		put: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
		list: vi
			.fn()
			.mockResolvedValue({ keys: [], list_complete: true, cursor: "" }),
	} as unknown as KVNamespace;
}

/**
 * Stub R2 bucket. Methods return null/undefined.
 */
export function createMockR2(): R2Bucket {
	return {
		get: vi.fn().mockResolvedValue(null),
		put: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
		head: vi.fn().mockResolvedValue(null),
		list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
		createMultipartUpload: vi.fn(),
		resumeMultipartUpload: vi.fn(),
	} as unknown as R2Bucket;
}

/**
 * Stub Vectorize index. Query returns empty matches.
 */
export function createMockVectorize(): VectorizeIndex {
	return {
		query: vi.fn().mockResolvedValue({ matches: [], count: 0 }),
		insert: vi.fn().mockResolvedValue({ mutationId: "mock-mutation" }),
		upsert: vi.fn().mockResolvedValue({ mutationId: "mock-mutation" }),
		deleteByIds: vi.fn().mockResolvedValue({ mutationId: "mock-mutation" }),
		getByIds: vi.fn().mockResolvedValue([]),
		describe: vi.fn().mockResolvedValue({
			name: "test-index",
			dimensions: 768,
			metric: "cosine",
		}),
	} as unknown as VectorizeIndex;
}

/**
 * Minimal Env stub for server functions that accept an Env-like object.
 */
export function createMockEnv(): Env {
	return {
		DB: {} as D1Database,
		RATION_KV: createMockKV(),
		STORAGE: createMockR2(),
		VECTORIZE: createMockVectorize(),
		AI: {} as Ai,
		BETTER_AUTH_URL: "http://localhost",
		BETTER_AUTH_SECRET: "test-secret",
		ADMIN_EMAILS: "admin@test.com",
		STRIPE_SECRET_KEY: "sk_test_mock",
		STRIPE_PUBLISHABLE_KEY: "pk_test_mock",
		STRIPE_WEBHOOK_SECRET: "whsec_mock",
		CF_AIG_TOKEN: "mock-token",
		AI_GATEWAY_ACCOUNT_ID: "841fa4c177353aa4844f0c7439b59f86",
		AI_GATEWAY_ID: "ration-gateway",
		STRIPE_PRICE_TASTE_TEST: "price_1T1qzDFX10NMafIYsLM60m7Z",
		STRIPE_PRICE_SUPPLY_RUN: "price_1T1r03FX10NMafIYUu3ZNrXU",
		STRIPE_PRICE_MISSION_CRATE: "price_1T1r12FX10NMafIYyOqMMUdr",
		STRIPE_PRICE_ORBITAL_STOCKPILE: "price_1T1r3EFX10NMafIYSU9MiQDV",
		STRIPE_PRICE_CREW_MEMBER_ANNUAL: "price_1T1r4zFX10NMafIY7ZFHe8xE",
		STRIPE_PROMO_WELCOME60: "promo_1T1r69FX10NMafIY6QRyJr02",
	} as unknown as Env;
}
