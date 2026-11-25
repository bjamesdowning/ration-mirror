import { describe, expect, it } from "vitest";
import { projectToolResult, toAgentMealIndexItem } from "../response-profile";

describe("agent meal index", () => {
	it("stays under a fixed size for a 20-meal galley", () => {
		const meals = Array.from({ length: 20 }, (_, index) =>
			toAgentMealIndexItem({
				id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
				name: `meal ${index}`,
				type: "recipe",
				servings: 4,
				domain: "food",
				tags: [{ slug: "dinner", name: "Dinner", id: "tag-1" }],
				nutritionStatus: "current",
				nutrition: {
					perServing: {
						energyKcal: 512.1234,
						proteinG: 21.5,
						carbG: 40.2,
						fatG: 18,
						fiberG: 4,
					},
					coverage: 0.9,
					attributions: [{ ingredientName: "rice", grams: 420 }],
					computedAt: "2026-11-02T00:00:00.000Z",
					recipeMassG: 420,
				},
				ingredients: [],
			}),
		);
		const projected = projectToolResult({
			tool: "list_meals",
			profile: "agent",
			data: meals,
			args: { includeIngredients: false },
		});
		const encoded = JSON.stringify(projected.data);
		expect(encoded.length).toBeLessThan(8_000);
		expect(encoded).not.toContain("attributions");
		expect(encoded).not.toContain("recipeMassG");
		expect(encoded).not.toContain('"ingredients"');
		expect(projected.meta?.ingredients).toBe("omitted");
		const first = (projected.data as Array<Record<string, unknown>>)[0];
		expect(first?.nutrition).toMatchObject({
			perServing: { carbsG: 40.2 },
		});
	});
});

describe("supply quantity rounding", () => {
	it("rounds to 2 decimals and drops trailing zeros", async () => {
		const { roundSupplyQuantity } = await import("../response-profile");
		expect(roundSupplyQuantity(0.30000000000000004)).toBe(0.3);
		expect(roundSupplyQuantity(1.005)).toBe(1.01);
		expect(roundSupplyQuantity(2.499999)).toBe(2.5);
		expect(roundSupplyQuantity(3)).toBe(3);
		expect(JSON.stringify(roundSupplyQuantity(1.1))).toBe("1.1");
	});

	it("rounds nested quantity fields for supply tools only", () => {
		const data = {
			items: [
				{ name: "rice", quantity: 1.3333333, unit: "kg" },
				{ name: "milk", quantity: 0.1 + 0.2, unit: "l" },
			],
		};
		const supply = projectToolResult({
			tool: "get_supply_list",
			profile: "agent",
			data,
		}).data as { items: { quantity: number }[] };
		expect(supply.items.map((i) => i.quantity)).toEqual([1.33, 0.3]);

		const card = projectToolResult({
			tool: "add_supply_item",
			profile: "card",
			data: { quantity: 2.0049 },
		}).data as { quantity: number };
		expect(card.quantity).toBe(2);

		const cargo = projectToolResult({
			tool: "list_inventory",
			profile: "agent",
			data: { quantity: 1.3333333 },
		}).data as { quantity: number };
		expect(cargo.quantity).toBe(1.3333333);
	});
});

describe("dates in tool results (#12)", () => {
	const at = new Date("2026-11-25T09:30:00.000Z");

	it("serialises Dates as ISO strings at any depth, never {}", () => {
		for (const profile of ["agent", "card"] as const) {
			const projected = projectToolResult({
				tool: "list_inventory",
				profile,
				data: [
					{
						id: "c1",
						expiresAt: at,
						history: [{ when: at, nested: { createdAt: at } }],
					},
				],
			});
			const encoded = JSON.stringify(projected.data);
			expect(encoded).not.toContain("{}");
			expect(projected.data).toEqual([
				{
					id: "c1",
					expiresAt: "2026-11-25T09:30:00.000Z",
					history: [
						{
							when: "2026-11-25T09:30:00.000Z",
							nested: { createdAt: "2026-11-25T09:30:00.000Z" },
						},
					],
				},
			]);
		}
	});

	it("returns null for an invalid Date", () => {
		const projected = projectToolResult({
			tool: "get_cargo_item",
			profile: "agent",
			data: { id: "c1", expiresAt: new Date("not a date") },
		});
		expect(projected.data).toEqual({ id: "c1", expiresAt: null });
	});

	it("keeps a top-level Date result", () => {
		const projected = projectToolResult({
			tool: "anything",
			profile: "agent",
			data: at,
		});
		expect(projected.data).toBe("2026-11-25T09:30:00.000Z");
	});

	it("serialises Dates on the sourceMeals strip path too", () => {
		const projected = projectToolResult({
			tool: "get_supply_list",
			profile: "agent",
			data: {
				id: "l1",
				name: "Live",
				updatedAt: at,
				items: [{ id: "i1", createdAt: at, sourceMeals: [{ id: "m1" }] }],
			},
		});
		expect(projected.data).toEqual({
			id: "l1",
			name: "Live",
			updatedAt: "2026-11-25T09:30:00.000Z",
			items: [{ id: "i1", createdAt: "2026-11-25T09:30:00.000Z" }],
		});
	});

	it("matches JSON.stringify for Dates", async () => {
		const { dateToIsoOrNull } = await import("../response-profile");
		expect(dateToIsoOrNull(at)).toBe(JSON.parse(JSON.stringify(at)));
		expect(dateToIsoOrNull(new Date(Number.NaN))).toBe(
			JSON.parse(JSON.stringify(new Date(Number.NaN))),
		);
	});
});

describe("internal ids in agent results (#15)", () => {
	const intakeRow = {
		id: "intake-1",
		organizationId: "org-1",
		userId: "user-1",
		consentId: "consent-1",
		healthSyncId: "hs-1",
		voidedByUserId: null,
		entryId: "entry-1",
		energyKcal: 420,
	};

	it("drops denied keys recursively in the agent profile", () => {
		const projected = projectToolResult({
			tool: "log_manifest_intake",
			profile: "agent",
			data: {
				operationId: "op-1",
				items: [{ intake: intakeRow, replayed: false }],
				meta: {
					credentialId: "k1",
					apiKeyId: "k1",
					clientId: "c1",
					activeOrganizationId: "org-1",
					cookedByUserId: "user-1",
					claimedByUserId: "user-2",
				},
			},
		});
		const encoded = JSON.stringify(projected.data);
		for (const key of [
			"organizationId",
			"userId",
			"consentId",
			"healthSyncId",
			"voidedByUserId",
			"credentialId",
			"apiKeyId",
			"clientId",
			"activeOrganizationId",
			"cookedByUserId",
			"claimedByUserId",
		]) {
			expect(encoded).not.toContain(`"${key}"`);
		}
		expect(projected.data).toEqual({
			operationId: "op-1",
			items: [
				{
					intake: { id: "intake-1", entryId: "entry-1", energyKcal: 420 },
					replayed: false,
				},
			],
			meta: {},
		});
	});

	it("keeps entity ids an agent passes back", () => {
		const projected = projectToolResult({
			tool: "get_meal_plan",
			profile: "agent",
			data: {
				planId: "p1",
				entries: [{ id: "e1", mealId: "m1", intakeId: "i1", cargoId: "c1" }],
			},
		});
		expect(projected.data).toEqual({
			planId: "p1",
			entries: [{ id: "e1", mealId: "m1", intakeId: "i1", cargoId: "c1" }],
		});
	});

	it("leaves the card profile untouched apart from dates", () => {
		const projected = projectToolResult({
			tool: "log_manifest_intake",
			profile: "card",
			data: { items: [intakeRow] },
		});
		expect(projected.data).toEqual({ items: [intakeRow] });
	});

	it("still hides opaque get_context key names", () => {
		const opaque = projectToolResult({
			tool: "get_context",
			profile: "agent",
			data: {
				organizationId: "org-1",
				apiKeyId: "key-abc",
				keyName: "key-abc",
				keyPrefix: "rtn_live_abcdefgh",
				scopes: ["mcp:read"],
			},
		});
		expect(opaque.data).toEqual({ scopes: ["mcp:read"] });

		const readable = projectToolResult({
			tool: "get_context",
			profile: "agent",
			data: {
				organizationId: "org-1",
				apiKeyId: "0d1f6c3e-6a41-4d2f-9c67-5b1a8f0e2c11",
				keyName: "Kitchen laptop",
				keyPrefix: "rtn_live_abcdefgh",
				scopes: ["mcp:read"],
			},
		});
		expect(readable.data).toEqual({
			keyName: "Kitchen laptop",
			scopes: ["mcp:read"],
		});
	});

	it("matches the deny-list helper", async () => {
		const { isAgentDeniedKey } = await import("../response-profile");
		expect(isAgentDeniedKey("organizationId")).toBe(true);
		expect(isAgentDeniedKey("reviewedByUserId")).toBe(true);
		expect(isAgentDeniedKey("intakeId")).toBe(false);
		expect(isAgentDeniedKey("entryId")).toBe(false);
		expect(isAgentDeniedKey("user")).toBe(false);
	});
});
