import { describe, expect, it, vi } from "vitest";
import {
	deleteUndoToken,
	loadUndoToken,
	storeUndoToken,
	tryStoreUndoToken,
	type UndoRecord,
} from "../undo-token.server";

function mockKv(store = new Map<string, string>()) {
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
	} as unknown as KVNamespace;
}

const sampleRecord: UndoRecord = {
	userId: "user-1",
	organizationId: "org-1",
	kind: "cook",
	deductions: [{ cargoId: "cargo-1", quantity: 2 }],
};

describe("tryStoreUndoToken", () => {
	it("returns token on success", async () => {
		const kv = mockKv();
		const stableToken = crypto.randomUUID();
		const token = await tryStoreUndoToken(kv, sampleRecord, stableToken);
		expect(token).toBe(stableToken);
		expect(kv.put).toHaveBeenCalledTimes(1);
	});

	it("returns undefined when KV put fails", async () => {
		const kv = mockKv();
		vi.mocked(kv.put).mockRejectedValue(new Error("KV unavailable"));
		const token = await tryStoreUndoToken(kv, sampleRecord);
		expect(token).toBeUndefined();
	});
});

describe("rollback-safe undo tokens", () => {
	it("returns null when token is missing", async () => {
		const kv = mockKv();
		const result = await loadUndoToken(
			kv,
			crypto.randomUUID(),
			"user-1",
			"org-1",
		);
		expect(result).toBeNull();
		expect(kv.delete).not.toHaveBeenCalled();
	});

	it("does not delete token when user/org mismatch", async () => {
		const kv = mockKv();
		const token = await storeUndoToken(kv, sampleRecord);
		const result = await loadUndoToken(kv, token, "other-user", "org-1");
		expect(result).toBeNull();
		expect(kv.delete).not.toHaveBeenCalled();
		const retry = await loadUndoToken(kv, token, "user-1", "org-1");
		expect(retry?.kind).toBe("cook");
		expect(kv.delete).not.toHaveBeenCalled();
	});

	it("keeps the token retryable until rollback succeeds", async () => {
		const kv = mockKv();
		const token = await storeUndoToken(kv, sampleRecord);
		const result = await loadUndoToken(kv, token, "user-1", "org-1");
		expect(result?.deductions).toEqual(sampleRecord.deductions);
		expect(kv.delete).not.toHaveBeenCalled();

		await deleteUndoToken(kv, token);
		expect(kv.delete).toHaveBeenCalledWith(`undo:${token}`);
		const second = await loadUndoToken(kv, token, "user-1", "org-1");
		expect(second).toBeNull();
	});
});
