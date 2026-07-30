import { describe, expect, it } from "vitest";
import {
	buildCargoJettisonedEvent,
	buildGalleyCookedEvent,
	buildKitchenEventInserts,
	buildManifestConsumedEvent,
	buildSupplyDockedEvent,
	decodeKitchenEventCursor,
	encodeKitchenEventCursor,
	isKitchenEventType,
	KITCHEN_EVENT_REGISTRY,
	KITCHEN_EVENT_RETENTION_DAYS,
	kitchenEventRetentionCutoff,
	listKitchenEventTypes,
} from "../kitchen-events.server";
import {
	D1_MAX_KITCHEN_EVENT_ROWS_PER_STATEMENT,
	KITCHEN_EVENT_INSERT_COLUMNS,
} from "../query-utils.server";

describe("KITCHEN_EVENT_REGISTRY", () => {
	it("covers every listed event type", () => {
		const types = listKitchenEventTypes();
		expect(types.length).toBeGreaterThanOrEqual(5);
		for (const type of types) {
			expect(KITCHEN_EVENT_REGISTRY[type]).toBeDefined();
			expect(KITCHEN_EVENT_REGISTRY[type].description.length).toBeGreaterThan(
				0,
			);
			expect(KITCHEN_EVENT_REGISTRY[type].zodPayloadSchema).toBeDefined();
		}
	});

	it("isKitchenEventType rejects unknown types", () => {
		expect(isKitchenEventType("galley_cooked")).toBe(true);
		expect(isKitchenEventType("not_a_real_event")).toBe(false);
	});
});

describe("kitchenEventRetentionCutoff", () => {
	it("is 396 days before now by default", () => {
		const now = new Date("2026-07-30T12:00:00.000Z");
		const cutoff = kitchenEventRetentionCutoff(now);
		const expected = new Date(
			now.getTime() - KITCHEN_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
		);
		expect(cutoff.toISOString()).toBe(expected.toISOString());
	});

	it("accepts a custom retention window", () => {
		const now = new Date("2026-07-30T00:00:00.000Z");
		const cutoff = kitchenEventRetentionCutoff(now, 30);
		expect(cutoff.toISOString()).toBe("2026-06-30T00:00:00.000Z");
	});
});

describe("event builders", () => {
	it("buildGalleyCookedEvent validates payload via registry", () => {
		const event = buildGalleyCookedEvent({
			organizationId: "org-1",
			userId: "user-1",
			mealId: "meal-1",
			mealName: "Pasta",
			servings: 2,
			deductions: [{ cargoId: "c1", quantity: 1 }],
			source: "web",
		});
		expect(event.eventType).toBe("galley_cooked");
		expect(event.subjectName).toBe("Pasta");
		expect(event.payload.servings).toBe(2);
		expect(
			KITCHEN_EVENT_REGISTRY.galley_cooked.zodPayloadSchema.parse(
				event.payload,
			),
		).toMatchObject({ servings: 2, source: "web" });
	});

	it("buildManifestConsumedEvent includes plan metadata", () => {
		const event = buildManifestConsumedEvent({
			organizationId: "org-1",
			mealId: "meal-1",
			mealName: "Tacos",
			planId: "plan-1",
			entryIds: ["e1", "e2"],
			date: "2026-07-30",
			slotType: "dinner",
			servings: 4,
			deductions: [],
		});
		expect(event.eventType).toBe("manifest_consumed");
		expect(event.payload.entryIds).toEqual(["e1", "e2"]);
		expect(event.payload.date).toBe("2026-07-30");
	});

	it("buildSupplyDockedEvent and buildCargoJettisonedEvent set cargo refs", () => {
		const docked = buildSupplyDockedEvent({
			organizationId: "org-1",
			itemName: "Milk",
			quantity: 1,
			unit: "l",
			cargoId: "c-milk",
		});
		expect(docked.eventType).toBe("supply_docked");
		expect(docked.cargoId).toBe("c-milk");

		const jettisoned = buildCargoJettisonedEvent({
			organizationId: "org-1",
			cargoId: "c-old",
			name: "Lettuce",
			quantity: 1,
			unit: "head",
			wasExpired: true,
			expiresAt: new Date("2026-07-01T00:00:00.000Z"),
		});
		expect(jettisoned.eventType).toBe("cargo_jettisoned");
		expect(jettisoned.payload.wasExpired).toBe(true);
		expect(jettisoned.payload.expiresAt).toBe("2026-07-01T00:00:00.000Z");
	});
});

describe("buildKitchenEventInserts", () => {
	it("returns empty when no events", () => {
		const fakeD1 = { insert: () => ({ values: () => "stmt" }) };
		const result = buildKitchenEventInserts(fakeD1, []);
		expect(result.stmts).toEqual([]);
		expect(result.eventIds).toEqual([]);
		expect(result.budgeted).toEqual([]);
	});

	it("chunks inserts and preserves explicit ids", () => {
		const insertedChunks: unknown[][] = [];
		const fakeD1 = {
			insert: () => ({
				values: (chunk: unknown[]) => {
					insertedChunks.push(chunk);
					return { kind: "insert", size: chunk.length };
				},
			}),
		};

		const count = D1_MAX_KITCHEN_EVENT_ROWS_PER_STATEMENT + 3;
		const events = Array.from({ length: count }, (_, i) =>
			buildGalleyCookedEvent({
				id: `evt-${i}`,
				organizationId: "org-1",
				mealId: `meal-${i}`,
				mealName: `Meal ${i}`,
				servings: 1,
				deductions: [],
			}),
		);

		const result = buildKitchenEventInserts(fakeD1, events);
		expect(result.eventIds).toEqual(events.map((_, i) => `evt-${i}`));
		expect(result.stmts.length).toBe(2);
		expect(result.budgeted).toHaveLength(2);
		expect(result.budgeted[0]?.bindCount).toBe(
			D1_MAX_KITCHEN_EVENT_ROWS_PER_STATEMENT * KITCHEN_EVENT_INSERT_COLUMNS,
		);
		expect(insertedChunks[0]?.length).toBe(
			D1_MAX_KITCHEN_EVENT_ROWS_PER_STATEMENT,
		);
		expect(insertedChunks[1]?.length).toBe(3);
	});

	it("rejects invalid payload at insert-build time", () => {
		const fakeD1 = { insert: () => ({ values: () => "stmt" }) };
		expect(() =>
			buildKitchenEventInserts(fakeD1, [
				{
					organizationId: "org-1",
					eventType: "galley_cooked",
					subjectName: "Bad",
					// servings required — omit to fail zod
					payload: { deductions: [] } as never,
				},
			]),
		).toThrow();
	});
});

describe("kitchen event cursor", () => {
	it("round-trips compound cursor", () => {
		const at = new Date("2026-07-30T12:00:00.000Z");
		const encoded = encodeKitchenEventCursor(at, "evt-9");
		expect(decodeKitchenEventCursor(encoded)).toEqual({
			occurredAt: at,
			id: "evt-9",
		});
	});

	it("accepts legacy ISO-only cursors", () => {
		const decoded = decodeKitchenEventCursor("2026-07-30T12:00:00.000Z");
		expect(decoded?.id).toBeNull();
		expect(decoded?.occurredAt.toISOString()).toBe("2026-07-30T12:00:00.000Z");
	});
});
