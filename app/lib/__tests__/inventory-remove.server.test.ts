import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";

vi.mock("~/lib/cargo.server", () => ({
	getCargoByIds: vi.fn(),
	jettisonItem: vi.fn(),
}));

import { getCargoByIds, jettisonItem } from "~/lib/cargo.server";
import {
	applyInventoryRemove,
	previewInventoryRemove,
} from "../inventory-remove.server";

function withMemoryKv(env: Env) {
	const store = new Map<string, string>();
	env.RATION_KV.get = vi.fn(async (key: string, type?: string) => {
		const value = store.get(String(key)) ?? null;
		if (value == null) return null;
		if (type === "json") return JSON.parse(value);
		return value;
	}) as never;
	env.RATION_KV.put = vi.fn(async (key: string, value: string) => {
		store.set(String(key), value);
	}) as never;
	env.RATION_KV.delete = vi.fn(async (key: string) => {
		store.delete(String(key));
	}) as never;
	return store;
}

describe("inventory-remove.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("previews removable vs not_found rows and stores a token", async () => {
		const env = createMockEnv();
		withMemoryKv(env);
		vi.mocked(getCargoByIds).mockResolvedValueOnce([
			{ id: "11111111-1111-4111-8111-111111111111", name: "Milk" },
		] as never);

		const preview = await previewInventoryRemove(env, "org-1", [
			"11111111-1111-4111-8111-111111111111",
			"22222222-2222-4222-8222-222222222222",
		]);

		expect(preview.totals).toEqual({ total: 2, remove: 1, notFound: 1 });
		expect(preview.previewToken.length).toBeGreaterThan(7);
		expect(env.RATION_KV.put).toHaveBeenCalled();
	});

	it("applies previewed removals idempotently", async () => {
		const env = createMockEnv();
		withMemoryKv(env);
		const itemId = "11111111-1111-4111-8111-111111111111";
		vi.mocked(getCargoByIds).mockResolvedValue([
			{ id: itemId, name: "Milk" },
		] as never);
		vi.mocked(jettisonItem).mockResolvedValue(undefined as never);

		const preview = await previewInventoryRemove(env, "org-1", [itemId]);
		const first = await applyInventoryRemove(env, "org-1", {
			previewToken: preview.previewToken,
			idempotencyKey: "idem-1",
		});
		expect(first.removed).toBe(1);
		expect(jettisonItem).toHaveBeenCalledTimes(1);

		const second = await applyInventoryRemove(env, "org-1", {
			previewToken: preview.previewToken,
			idempotencyKey: "idem-1",
		});
		expect(second.replayed).toBe(true);
		expect(jettisonItem).toHaveBeenCalledTimes(1);
	});
});
