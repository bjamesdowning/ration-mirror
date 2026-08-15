import { describe, expect, it, vi } from "vitest";
import {
	BA_SECONDARY_STORAGE_PREFIX,
	betterAuthSecondaryStorageKey,
	clearBetterAuthSecondarySessionsForUser,
	createBetterAuthSecondaryStorage,
	invalidateBetterAuthSessionCache,
} from "~/lib/auth-secondary-storage.server";

function createMemoryKV(): KVNamespace {
	const store = new Map<string, string>();
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
		list: vi.fn(),
		getWithMetadata: vi.fn(),
	} as unknown as KVNamespace;
}

describe("betterAuthSecondaryStorageKey", () => {
	it("namespaces keys under ba:ss:", () => {
		expect(betterAuthSecondaryStorageKey("tok_abc")).toBe(
			`${BA_SECONDARY_STORAGE_PREFIX}tok_abc`,
		);
		expect(betterAuthSecondaryStorageKey("active-sessions-u1")).toBe(
			`${BA_SECONDARY_STORAGE_PREFIX}active-sessions-u1`,
		);
	});
});

describe("createBetterAuthSecondaryStorage", () => {
	it("get/set/delete round-trip with TTL", async () => {
		const kv = createMemoryKV();
		const storage = createBetterAuthSecondaryStorage(kv);

		await storage.set("sess-1", JSON.stringify({ ok: true }), 120);
		expect(await storage.get("sess-1")).toBe(JSON.stringify({ ok: true }));
		expect(kv.put).toHaveBeenCalledWith(
			`${BA_SECONDARY_STORAGE_PREFIX}sess-1`,
			JSON.stringify({ ok: true }),
			{ expirationTtl: 120 },
		);

		await storage.delete("sess-1");
		expect(await storage.get("sess-1")).toBeNull();
	});

	it("clamps TTL below 60s up to KV minimum", async () => {
		const kv = createMemoryKV();
		const storage = createBetterAuthSecondaryStorage(kv);
		await storage.set("sess-2", "x", 10);
		expect(kv.put).toHaveBeenCalledWith(
			`${BA_SECONDARY_STORAGE_PREFIX}sess-2`,
			"x",
			{ expirationTtl: 60 },
		);
	});
});

describe("invalidateBetterAuthSessionCache", () => {
	it("deletes the namespaced token key", async () => {
		const kv = createMemoryKV();
		await kv.put(`${BA_SECONDARY_STORAGE_PREFIX}tok`, "cached");
		await invalidateBetterAuthSessionCache(kv, "tok");
		expect(await kv.get(`${BA_SECONDARY_STORAGE_PREFIX}tok`)).toBeNull();
	});

	it("no-ops on empty token", async () => {
		const kv = createMemoryKV();
		await invalidateBetterAuthSessionCache(kv, "");
		expect(kv.delete).not.toHaveBeenCalled();
	});
});

describe("clearBetterAuthSecondarySessionsForUser", () => {
	it("clears session tokens and active-sessions list", async () => {
		const kv = createMemoryKV();
		await kv.put(`${BA_SECONDARY_STORAGE_PREFIX}a`, "1");
		await kv.put(`${BA_SECONDARY_STORAGE_PREFIX}b`, "2");
		await kv.put(`${BA_SECONDARY_STORAGE_PREFIX}active-sessions-user-1`, "[]");

		await clearBetterAuthSecondarySessionsForUser(kv, "user-1", ["a", "b", ""]);

		expect(await kv.get(`${BA_SECONDARY_STORAGE_PREFIX}a`)).toBeNull();
		expect(await kv.get(`${BA_SECONDARY_STORAGE_PREFIX}b`)).toBeNull();
		expect(
			await kv.get(`${BA_SECONDARY_STORAGE_PREFIX}active-sessions-user-1`),
		).toBeNull();
	});
});
