import { describe, expect, it, vi } from "vitest";
import {
	SupplySyncBusyError,
	withSupplySyncLock,
} from "../supply-sync-lock.server";

function createStoreKV() {
	const store = new Map<string, string>();
	const kv = {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
	};
	return { kv: kv as unknown as KVNamespace, store };
}

describe("withSupplySyncLock", () => {
	it("runs fn when lock is free", async () => {
		const { kv, store } = createStoreKV();
		const result = await withSupplySyncLock(kv, "org-1", async () => "ok");
		expect(result).toBe("ok");
		expect(store.size).toBe(0);
	});

	it("throws SupplySyncBusyError when lock is held", async () => {
		const kv = {
			get: vi.fn().mockResolvedValue("other-token"),
			put: vi.fn(),
			delete: vi.fn(),
		} as unknown as KVNamespace;

		await expect(
			withSupplySyncLock(kv, "org-1", async () => "ok"),
		).rejects.toBeInstanceOf(SupplySyncBusyError);
		expect(kv.put).not.toHaveBeenCalled();
	});

	it("releases lock even when fn throws", async () => {
		const { kv, store } = createStoreKV();
		await expect(
			withSupplySyncLock(kv, "org-1", async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(store.size).toBe(0);
	});
});
