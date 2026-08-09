import { describe, expect, it } from "vitest";
import {
	cargoExpiredPayloadSchema,
	cargoJettisonedPayloadSchema,
	galleyCookedPayloadSchema,
	kitchenEventTypeSchema,
	manifestConsumedPayloadSchema,
	manifestCookedPayloadSchema,
	supplyDockedPayloadSchema,
} from "../kitchen-events";

describe("kitchen event payload schemas", () => {
	it("accepts galley_cooked payload", () => {
		const parsed = galleyCookedPayloadSchema.parse({
			servings: 2,
			deductions: [{ cargoId: "c1", quantity: 1.5 }],
			source: "mcp",
		});
		expect(parsed.servings).toBe(2);
		expect(parsed.source).toBe("mcp");
	});

	it("requires entryIds for manifest_consumed", () => {
		expect(() =>
			manifestConsumedPayloadSchema.parse({
				planId: "p1",
				entryIds: [],
				servings: 1,
			}),
		).toThrow();
	});

	it("still decodes legacy personal nutrition on manifest_consumed", () => {
		const parsed = manifestConsumedPayloadSchema.parse({
			planId: "p1",
			entryIds: ["e1"],
			servings: 2,
			energyKcal: 400,
			portionServings: 1,
			verified: true,
		});
		expect(parsed.energyKcal).toBe(400);
	});

	it("accepts manifest_cooked logistics-only payload", () => {
		const parsed = manifestCookedPayloadSchema.parse({
			planId: "p1",
			entryIds: ["e1"],
			servings: 2,
			deductions: [],
		});
		expect(parsed.planId).toBe("p1");
	});

	it("kitchenEventTypeSchema accepts manifest_cooked", () => {
		expect(kitchenEventTypeSchema.parse("manifest_cooked")).toBe(
			"manifest_cooked",
		);
	});

	it("accepts supply_docked / cargo_expired / cargo_jettisoned", () => {
		expect(
			supplyDockedPayloadSchema.parse({ quantity: 1, unit: "kg" }).unit,
		).toBe("kg");
		expect(
			cargoExpiredPayloadSchema.parse({
				quantity: 1,
				unit: "each",
				expiresAt: "2026-01-01T00:00:00.000Z",
			}).expiresAt,
		).toBe("2026-01-01T00:00:00.000Z");
		expect(
			cargoJettisonedPayloadSchema.parse({
				quantity: 1,
				unit: "each",
				wasExpired: false,
			}).wasExpired,
		).toBe(false);
	});

	it("kitchenEventTypeSchema rejects unknown types", () => {
		expect(kitchenEventTypeSchema.parse("cargo_expired")).toBe("cargo_expired");
		expect(() => kitchenEventTypeSchema.parse("mystery")).toThrow();
	});
});
