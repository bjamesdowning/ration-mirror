import { describe, expect, it, vi } from "vitest";
import type { InventoryImportItem } from "../../inventory-import.server";

vi.mock("../../crypto.server", () => ({
	sha256Hex: vi.fn(async () => "preview-token-abc12345"),
}));

describe("preview_inventory_import summary-first", () => {
	it("returns sample rows plus rowsOmitted for large previews", async () => {
		const { previewInventoryImport } = await import(
			"../../inventory-import.server"
		);
		const items: InventoryImportItem[] = Array.from({ length: 25 }, (_, i) => ({
			name: `Item ${i + 1}`,
			quantity: 1,
			unit: "g",
			domain: "food",
		}));
		const kvStore = new Map<string, string>();
		const env = {
			RATION_KV: {
				put: vi.fn(async (key: string, value: string) => {
					kvStore.set(key, value);
				}),
				get: vi.fn(),
			},
			DB: {
				prepare: vi.fn(() => ({
					bind: vi.fn().mockReturnThis(),
					all: vi.fn().mockResolvedValue({ results: [] }),
				})),
			},
		} as unknown as Cloudflare.Env;

		const preview = await previewInventoryImport(env, "org-1", items);
		expect(preview.totals.total).toBe(25);
		expect(preview.rows.length).toBe(10);
		expect(preview.rowsOmitted).toBe(15);
		expect(preview.previewToken).toBeTruthy();
		expect(kvStore.size).toBe(1);
	});
});
