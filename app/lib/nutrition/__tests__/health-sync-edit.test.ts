import { describe, expect, it } from "vitest";
import {
	editCompositionStamp,
	healthExportAllowed,
	healthSyncVersionAfterEdit,
} from "../health-exportability";

const now = new Date("2026-11-09T12:00:00.000Z");
const earlier = new Date("2026-11-08T08:00:00.000Z");
const unchanged = {
	nutrientsChanged: false,
	occurredAtChanged: false,
	nameChanged: false,
};

describe("healthSyncVersionAfterEdit", () => {
	it("keeps the version for a notes-only or tag-only edit", () => {
		expect(healthSyncVersionAfterEdit(3, unchanged)).toBe(3);
	});

	it("bumps the version when the amounts, the time, or the name change", () => {
		expect(
			healthSyncVersionAfterEdit(3, { ...unchanged, nutrientsChanged: true }),
		).toBe(4);
		expect(
			healthSyncVersionAfterEdit(3, { ...unchanged, occurredAtChanged: true }),
		).toBe(4);
		expect(
			healthSyncVersionAfterEdit(3, { ...unchanged, nameChanged: true }),
		).toBe(4);
		expect(
			healthSyncVersionAfterEdit(3, {
				nutrientsChanged: true,
				occurredAtChanged: true,
				nameChanged: true,
			}),
		).toBe(4);
	});

	it("treats a legacy row without a version as version 1", () => {
		expect(healthSyncVersionAfterEdit(null, unchanged)).toBe(1);
		expect(
			healthSyncVersionAfterEdit(undefined, {
				...unchanged,
				nameChanged: true,
			}),
		).toBe(2);
	});
});

describe("editCompositionStamp", () => {
	it("keeps an AI estimate out of Health when the amounts did not change", () => {
		const stamp = editCompositionStamp({
			current: {
				compositionSource: "ai_estimate",
				compositionConfirmedAt: null,
			},
			nutrientsChanged: false,
			requestedSource: undefined,
			savedFood: false,
			now,
		});
		expect(stamp).toEqual({
			compositionSource: "ai_estimate",
			compositionConfirmedAt: null,
		});
		expect(healthExportAllowed(stamp)).toBe(false);
	});

	it("keeps the original source and confirmation time for a time or name edit", () => {
		expect(
			editCompositionStamp({
				current: { compositionSource: "usda", compositionConfirmedAt: earlier },
				nutrientsChanged: false,
				requestedSource: "manual_macros",
				savedFood: false,
				now,
			}),
		).toEqual({ compositionSource: "usda", compositionConfirmedAt: earlier });
	});

	it("marks typed new amounts as a confirmed user override", () => {
		const stamp = editCompositionStamp({
			current: {
				compositionSource: "ai_estimate",
				compositionConfirmedAt: null,
			},
			nutrientsChanged: true,
			requestedSource: undefined,
			savedFood: false,
			now,
		});
		expect(stamp).toEqual({
			compositionSource: "user_override",
			compositionConfirmedAt: now,
		});
		expect(healthExportAllowed(stamp)).toBe(true);
	});

	it("uses manual macros for a saved food and honours a named source", () => {
		expect(
			editCompositionStamp({
				current: { compositionSource: "usda", compositionConfirmedAt: earlier },
				nutrientsChanged: true,
				requestedSource: "barcode",
				savedFood: true,
				now,
			}),
		).toEqual({
			compositionSource: "manual_macros",
			compositionConfirmedAt: now,
		});
		expect(
			editCompositionStamp({
				current: { compositionSource: "usda", compositionConfirmedAt: earlier },
				nutrientsChanged: true,
				requestedSource: "barcode",
				savedFood: false,
				now,
			}),
		).toEqual({ compositionSource: "barcode", compositionConfirmedAt: now });
		expect(
			editCompositionStamp({
				current: { compositionSource: "usda", compositionConfirmedAt: earlier },
				nutrientsChanged: true,
				requestedSource: "ai_estimate",
				savedFood: false,
				now,
			}),
		).toEqual({
			compositionSource: "ai_estimate",
			compositionConfirmedAt: null,
		});
	});

	it("falls back to the create default for a legacy row with no source", () => {
		expect(
			editCompositionStamp({
				current: { compositionSource: null, compositionConfirmedAt: null },
				nutrientsChanged: false,
				requestedSource: undefined,
				savedFood: false,
				now,
			}),
		).toEqual({
			compositionSource: "manual_macros",
			compositionConfirmedAt: now,
		});
	});
});
