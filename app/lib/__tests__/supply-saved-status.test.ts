import { describe, expect, it } from "vitest";
import {
	formatAddToLiveCounts,
	formatLastBought,
	formatSavedItemStatus,
	previewAddToLive,
	reduceBulkSelection,
	reduceOptimisticAdd,
	sortForPullFrom,
} from "~/lib/supply-saved-status";

const now = new Date("2026-10-18T12:00:00.000Z");

describe("saved list status line", () => {
	it("formats last bought relative to today", () => {
		expect(formatLastBought("2026-10-18T08:00:00.000Z", now)).toBe(
			"Last bought today",
		);
		expect(formatLastBought("2026-09-27T12:00:00.000Z", now)).toBe(
			"Last bought 3 wk ago",
		);
		expect(formatLastBought(null, now)).toBeNull();
	});

	it("joins cargo, last bought, and live state", () => {
		expect(
			formatSavedItemStatus(
				{
					name: "Milk",
					quantity: 2,
					unit: "L",
					inCargo: 2,
					lastDockedAt: "2026-09-27T12:00:00.000Z",
					live: { state: "on_live", quantity: 2, unit: "L" },
				},
				now,
			),
		).toBe("In Cargo 2 · Last bought 3 wk ago · On Live 2 L");
		expect(
			formatSavedItemStatus(
				{
					name: "Eggs",
					quantity: 6,
					unit: "unit",
					live: { state: "in_cart" },
				},
				now,
			),
		).toBe("In cart");
	});
});

describe("add to live presentation", () => {
	it("formats the bulk toast and skips zero counts", () => {
		expect(
			formatAddToLiveCounts({
				added: 5,
				merged: 0,
				skippedOnLive: 3,
				skippedInCart: 0,
				skippedInCargo: 2,
			}),
		).toBe("Added 5 · 3 already on Live · 2 in Cargo");
	});

	it("turns the first tap into On Live and ignores a second tap", () => {
		const pending = reduceOptimisticAdd(
			{ phase: "idle", status: "none" },
			"tap",
		);
		expect(pending).toEqual({ phase: "pending", status: "on_live" });
		expect(reduceOptimisticAdd(pending, "tap")).toEqual(pending);
		expect(reduceOptimisticAdd(pending, "success")).toEqual({
			phase: "idle",
			status: "on_live",
		});
		expect(
			reduceOptimisticAdd({ phase: "idle", status: "on_live" }, "undo"),
		).toEqual({ phase: "idle", status: "none" });
	});

	it("selects ids and clears them", () => {
		const started = reduceBulkSelection(
			{ active: false, ids: [] },
			{ type: "start" },
		);
		const one = reduceBulkSelection(started, { type: "toggle", id: "a" });
		const two = reduceBulkSelection(one, { type: "toggle", id: "b" });
		expect(two.ids).toEqual(["a", "b"]);
		expect(reduceBulkSelection(two, { type: "toggle", id: "a" }).ids).toEqual([
			"b",
		]);
		expect(reduceBulkSelection(two, { type: "cancel" })).toEqual({
			active: false,
			ids: [],
		});
	});

	it("previews missing adds and asks for review on add all", () => {
		const items = [
			{
				id: "1",
				name: "Milk",
				quantity: 1,
				unit: "unit",
				live: { state: "on_live" as const },
			},
			{
				id: "2",
				name: "Rice",
				quantity: 1,
				unit: "unit",
				inCargo: 2,
				live: { state: "none" as const },
			},
			{
				id: "3",
				name: "Oats",
				quantity: 1,
				unit: "unit",
				live: { state: "none" as const },
			},
		];
		const missing = previewAddToLive(items, "missing");
		expect(missing.adding.map((item) => item.name)).toEqual(["Oats"]);
		expect(missing.skippedOnLive).toBe(1);
		expect(missing.skippedInCargo).toBe(1);
		expect(previewAddToLive(items, "all").needsReview).toBe(true);
	});

	it("sorts never-bought items after the oldest purchase", () => {
		const sorted = sortForPullFrom([
			{ name: "New", category: "dry", lastDockedAt: null },
			{
				name: "Old",
				category: "dry",
				lastDockedAt: "2026-01-01T00:00:00.000Z",
			},
			{
				name: "Recent",
				category: "dry",
				lastDockedAt: "2026-10-01T00:00:00.000Z",
			},
		]);
		expect(sorted.map((item) => item.name)).toEqual(["Old", "Recent", "New"]);
	});
});
