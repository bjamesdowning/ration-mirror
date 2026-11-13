import { describe, expect, it } from "vitest";
import { toMobileCargoItem } from "~/lib/mobile/cargo-item";

const now = new Date("2026-11-13T12:00:00.000Z");

const override = {
	source: "user_override",
	confidence: 1,
	verified: true,
	per100g: null,
	perServing: {
		energyKcal: 10,
		proteinG: 200,
		fatG: 200,
		carbG: 200,
		fiberG: null,
		sugarG: null,
		satFatG: null,
		sodiumMg: null,
		saltG: null,
	},
	fdcId: null,
	description: null,
};

describe("toMobileCargoItem", () => {
	it("fills the fields iOS CargoItem requires when a tagged override merges into an index row", () => {
		const item = toMobileCargoItem(
			{
				id: "cargo_existing",
				name: "yogurt",
				domain: "food",
				quantity: 2,
				unit: "unit",
				expiresAt: null,
				updatedAt: now,
				nutrition: JSON.stringify(override),
				tags: [
					{
						id: "tag_1",
						slug: "test",
						name: "Test",
						color: "#00E088",
						category: null,
						createdAt: now,
					},
				],
			},
			"org_1",
			now,
		);

		expect(item.organizationId).toBe("org_1");
		expect(item.status).toBe("stable");
		expect(item.createdAt).toBe("2026-11-13T12:00:00.000Z");
		expect(item.updatedAt).toBe("2026-11-13T12:00:00.000Z");
		expect(item.expiresAt).toBeNull();
		expect(item.baseQuantity).toBe(2);
		expect(item.baseUnit).toBe("unit");
		expect(item.tags).toEqual([
			{
				id: "tag_1",
				slug: "test",
				name: "Test",
				color: "#00E088",
				category: null,
			},
		]);
		expect(item.nutrition).toEqual({
			...override,
			confidence: 1,
			verified: true,
		});
		expect(JSON.parse(JSON.stringify(item)).nutrition.fdcId).toBeNull();
		expect(typeof item.createdAt).toBe("string");
	});

	it("keeps a plain item with no tag and no nutrition override", () => {
		const item = toMobileCargoItem(
			{
				id: "cargo_plain",
				organizationId: "org_1",
				name: "salt",
				quantity: 1,
				unit: "unit",
				domain: "food",
				status: "stable",
				baseQuantity: 1,
				baseUnit: "unit",
				tags: [],
				expiresAt: null,
				createdAt: now,
				updatedAt: now,
				nutrition: null,
			},
			"org_1",
			now,
		);

		expect(item.nutrition).toBeNull();
		expect(item.tags).toEqual([]);
		expect(item.name).toBe("salt");
		expect(item.organizationId).toBe("org_1");
		expect(item.createdAt).toBe("2026-11-13T12:00:00.000Z");
		expect(item.quantity).toBe(1);
	});

	it("coerces a non-integer or string fdcId so the snapshot still decodes", () => {
		const item = toMobileCargoItem(
			{
				id: "cargo_fdc",
				name: "oats",
				quantity: "1",
				unit: "unit",
				createdAt: now,
				updatedAt: now,
				nutrition: {
					...override,
					fdcId: "167512",
					verified: 1,
				},
			},
			"org_1",
			now,
		);

		expect(item.quantity).toBe(1);
		expect(item.nutrition?.fdcId).toBe(167512);
		expect(item.nutrition?.verified).toBe(true);
		expect(item.nutrition?.perServing?.proteinG).toBe(200);
	});
});
