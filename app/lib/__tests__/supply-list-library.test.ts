import { describe, expect, it } from "vitest";
import { nextQuotaSlot } from "~/lib/supply-list-capacity.server";
import {
	canArchiveSupplyList,
	canDeleteSupplyList,
	canIssueSupplyShareToken,
	canMutateSharedSupplyList,
	canMutateSupplyItems,
	canRenameSupplyList,
	canShopSupplyList,
	canSnoozeSupplyList,
	canSyncSupplyList,
	isSupplyListReachable,
	isUniqueConstraintError,
	pickLegacyLiveCandidate,
	resolveSupplyListState,
} from "~/lib/supply-list-kinds";
import {
	cloneSupplyItemValues,
	mergeSupplyItemQuantities,
} from "~/lib/supply-lists.server";

type SupplyItemRow = Parameters<typeof cloneSupplyItemValues>[0];

function qty(
	overrides: Partial<
		Pick<
			SupplyItemRow,
			"quantity" | "unit" | "name" | "baseQuantity" | "baseUnit"
		>
	> = {},
) {
	return {
		name: "milk",
		quantity: 1,
		unit: "l",
		baseQuantity: 1000,
		baseUnit: "ml",
		...overrides,
	};
}

describe("pickLegacyLiveCandidate", () => {
	it("prefers the newest list named Supply", () => {
		const picked = pickLegacyLiveCandidate([
			{ id: "a", name: "Costco", updatedAt: new Date("2026-01-02") },
			{ id: "b", name: "Supply", updatedAt: new Date("2026-01-01") },
			{ id: "c", name: "Supply", updatedAt: new Date("2026-01-03") },
		]);
		expect(picked.id).toBe("c");
	});

	it("breaks ties by stable id", () => {
		const stamp = new Date("2026-01-01");
		const picked = pickLegacyLiveCandidate([
			{ id: "z", name: "Supply", updatedAt: stamp },
			{ id: "a", name: "Supply", updatedAt: stamp },
		]);
		expect(picked.id).toBe("a");
	});

	it("falls back to the newest list when none is named Supply", () => {
		const picked = pickLegacyLiveCandidate([
			{ id: "a", name: "Costco", updatedAt: new Date("2026-01-01") },
			{ id: "b", name: "Aldi", updatedAt: new Date("2026-01-03") },
		]);
		expect(picked.id).toBe("b");
	});
});

describe("quota slots", () => {
	it("allocates the lowest free slot including the last slot", () => {
		expect(nextQuotaSlot(new Set(), 3)).toBe(1);
		expect(nextQuotaSlot(new Set([1, 2]), 3)).toBe(3);
		expect(nextQuotaSlot(new Set([1, 2, 3]), 3)).toBeNull();
		expect(nextQuotaSlot(new Set([1, 2, 3, 25]), 25)).toBe(4);
		expect(
			nextQuotaSlot(new Set(Array.from({ length: 25 }, (_, i) => i + 1)), 25),
		).toBeNull();
	});
});

describe("list states", () => {
	it("treats archived saved lists as archived", () => {
		expect(
			resolveSupplyListState({ kind: "saved", archivedAt: new Date() }),
		).toBe("archived");
		expect(canShopSupplyList("archived")).toBe(false);
		expect(canMutateSupplyItems("template")).toBe(false);
		expect(canSyncSupplyList("saved")).toBe(false);
		expect(canSyncSupplyList("live")).toBe(true);
		expect(canSnoozeSupplyList("saved")).toBe(false);
		expect(canRenameSupplyList("live")).toBe(false);
		expect(canDeleteSupplyList("live")).toBe(false);
		expect(canArchiveSupplyList("live")).toBe(false);
		expect(canArchiveSupplyList("saved")).toBe(true);
		expect(canShopSupplyList("saved")).toBe(true);
	});

	it("hides non-Live lists when the library flag is off", () => {
		expect(isSupplyListReachable("live", false)).toBe(true);
		expect(isSupplyListReachable("saved", false)).toBe(false);
		expect(isSupplyListReachable("template", false)).toBe(false);
		expect(isSupplyListReachable("archived", false)).toBe(false);
		expect(isSupplyListReachable("saved", true)).toBe(true);
	});

	it("issues share tokens for Live/Saved/Archived and never for Template", () => {
		expect(canIssueSupplyShareToken("live")).toBe(true);
		expect(canIssueSupplyShareToken("saved")).toBe(true);
		expect(canIssueSupplyShareToken("archived")).toBe(true);
		expect(canIssueSupplyShareToken("template")).toBe(false);
		expect(canMutateSharedSupplyList("live")).toBe(true);
		expect(canMutateSharedSupplyList("saved")).toBe(true);
		expect(canMutateSharedSupplyList("archived")).toBe(false);
		expect(canMutateSharedSupplyList("template")).toBe(false);
	});
});

describe("unique constraint detection", () => {
	it("matches sqlite unique failures", () => {
		expect(isUniqueConstraintError(new Error("UNIQUE constraint failed"))).toBe(
			true,
		);
		expect(isUniqueConstraintError(new Error("SQLITE_CONSTRAINT"))).toBe(true);
		expect(isUniqueConstraintError(new Error("no such table"))).toBe(false);
	});
});

describe("clone and merge", () => {
	it("clones with a new id and can reset purchased", () => {
		const source = {
			id: "item-1",
			listId: "list-1",
			name: "Milk",
			quantity: 1,
			unit: "l",
			baseQuantity: 1000,
			baseUnit: "ml",
			domain: "food",
			isPurchased: true,
			sourceMealId: null,
			sourceMealIds: [],
			sourceOrigins: ["manual", "receipt"],
			sourceCargoId: null,
			note: "skim",
			category: "dairy",
			sortOrder: 2,
			createdAt: new Date("2026-01-01"),
			updatedAt: new Date("2026-01-01"),
		} as unknown as SupplyItemRow;
		const cloned = cloneSupplyItemValues(source, "list-2", {
			resetPurchased: true,
		});
		expect(cloned.id).not.toBe(source.id);
		expect(cloned.listId).toBe("list-2");
		expect(cloned.isPurchased).toBe(false);
		expect(cloned.sourceOrigins).toEqual(["manual"]);
		expect(cloned.note).toBe("skim");
	});

	it("merges compatible quantities in base units", () => {
		const merged = mergeSupplyItemQuantities(
			qty({ quantity: 1, baseQuantity: 1000 }),
			qty({ quantity: 0.5, baseQuantity: 500 }),
		);
		expect(merged.baseQuantity).toBe(1500);
		expect(merged.baseUnit).toBe("ml");
	});
});
