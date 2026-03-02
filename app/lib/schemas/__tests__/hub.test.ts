import { describe, expect, it } from "vitest";
import {
	HubLayoutSchema,
	HubWidgetFiltersSchema,
	HubWidgetLayoutSchema,
} from "~/lib/schemas/hub";

// ---------------------------------------------------------------------------
// HubWidgetFiltersSchema
// ---------------------------------------------------------------------------

describe("HubWidgetFiltersSchema", () => {
	it("accepts an empty object (no filters active)", () => {
		expect(HubWidgetFiltersSchema.safeParse({}).success).toBe(true);
	});

	it("accepts a valid tags array", () => {
		const result = HubWidgetFiltersSchema.safeParse({
			tags: ["dinner", "high-protein"],
		});
		expect(result.success).toBe(true);
		if (result.success)
			expect(result.data.tags).toEqual(["dinner", "high-protein"]);
	});

	it("rejects tags array exceeding 5 entries", () => {
		const result = HubWidgetFiltersSchema.safeParse({
			tags: ["a", "b", "c", "d", "e", "f"],
		});
		expect(result.success).toBe(false);
	});

	it("rejects an empty tag string inside the array", () => {
		const result = HubWidgetFiltersSchema.safeParse({ tags: [""] });
		expect(result.success).toBe(false);
	});

	it("rejects a tag string exceeding 50 characters", () => {
		const result = HubWidgetFiltersSchema.safeParse({
			tags: ["a".repeat(51)],
		});
		expect(result.success).toBe(false);
	});

	it("accepts a valid slotType", () => {
		for (const slot of ["breakfast", "lunch", "dinner", "snack"] as const) {
			const result = HubWidgetFiltersSchema.safeParse({ slotType: slot });
			expect(result.success).toBe(true);
		}
	});

	it("rejects an invalid slotType", () => {
		const result = HubWidgetFiltersSchema.safeParse({ slotType: "supper" });
		expect(result.success).toBe(false);
	});

	it("accepts a valid domain", () => {
		for (const domain of ["food", "household", "alcohol"] as const) {
			const result = HubWidgetFiltersSchema.safeParse({ domain });
			expect(result.success).toBe(true);
		}
	});

	it("rejects an invalid domain", () => {
		const result = HubWidgetFiltersSchema.safeParse({ domain: "pets" });
		expect(result.success).toBe(false);
	});

	it("accepts a limit within 1–20", () => {
		expect(HubWidgetFiltersSchema.safeParse({ limit: 1 }).success).toBe(true);
		expect(HubWidgetFiltersSchema.safeParse({ limit: 20 }).success).toBe(true);
		expect(HubWidgetFiltersSchema.safeParse({ limit: 10 }).success).toBe(true);
	});

	it("rejects limit of 0", () => {
		expect(HubWidgetFiltersSchema.safeParse({ limit: 0 }).success).toBe(false);
	});

	it("rejects limit above 20", () => {
		expect(HubWidgetFiltersSchema.safeParse({ limit: 21 }).success).toBe(false);
	});

	it("rejects a non-integer limit", () => {
		expect(HubWidgetFiltersSchema.safeParse({ limit: 5.5 }).success).toBe(
			false,
		);
	});

	it("accepts all filter fields combined", () => {
		const result = HubWidgetFiltersSchema.safeParse({
			tags: ["dinner"],
			slotType: "dinner",
			domain: "food",
			limit: 8,
		});
		expect(result.success).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// HubWidgetLayoutSchema — filters field integration
// ---------------------------------------------------------------------------

describe("HubWidgetLayoutSchema — filters field", () => {
	const baseWidget = {
		id: "meals-ready",
		order: 0,
		size: "lg",
		visible: true,
	};

	it("accepts a widget without filters (backward compatible)", () => {
		expect(HubWidgetLayoutSchema.safeParse(baseWidget).success).toBe(true);
	});

	it("accepts a widget with an empty filters object", () => {
		const result = HubWidgetLayoutSchema.safeParse({
			...baseWidget,
			filters: {},
		});
		expect(result.success).toBe(true);
	});

	it("accepts a widget with valid tag filters", () => {
		const result = HubWidgetLayoutSchema.safeParse({
			...baseWidget,
			filters: { tags: ["dinner", "weeknight"] },
		});
		expect(result.success).toBe(true);
		if (result.success)
			expect(result.data.filters?.tags).toEqual(["dinner", "weeknight"]);
	});

	it("rejects a widget with an invalid filter (limit too large)", () => {
		const result = HubWidgetLayoutSchema.safeParse({
			...baseWidget,
			filters: { limit: 99 },
		});
		expect(result.success).toBe(false);
	});

	it("rejects an unknown widget id", () => {
		const result = HubWidgetLayoutSchema.safeParse({
			...baseWidget,
			id: "unknown-widget",
		});
		expect(result.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// HubLayoutSchema — full layout round-trip with filters
// ---------------------------------------------------------------------------

describe("HubLayoutSchema — full layout with filters", () => {
	it("accepts a layout where each widget has independent filters", () => {
		const result = HubLayoutSchema.safeParse({
			widgets: [
				{
					id: "meals-ready",
					order: 0,
					size: "lg",
					visible: true,
					filters: { tags: ["dinner"], limit: 6 },
				},
				{
					id: "cargo-expiring",
					order: 1,
					size: "md",
					visible: true,
					filters: { domain: "food", limit: 10 },
				},
				{
					id: "manifest-preview",
					order: 2,
					size: "md",
					visible: true,
					filters: { slotType: "dinner" },
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it("rejects a layout exceeding 20 widgets", () => {
		const tooMany = Array.from({ length: 21 }, (_, i) => ({
			id: "hub-stats",
			order: i,
			size: "lg",
			visible: true,
		}));
		const result = HubLayoutSchema.safeParse({ widgets: tooMany });
		expect(result.success).toBe(false);
	});

	it("rejects a layout where one widget has an invalid filter", () => {
		const result = HubLayoutSchema.safeParse({
			widgets: [
				{
					id: "meals-ready",
					order: 0,
					size: "lg",
					visible: true,
					filters: { slotType: "supper" }, // invalid
				},
			],
		});
		expect(result.success).toBe(false);
	});
});
