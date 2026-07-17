import { describe, expect, it } from "vitest";
import { CargoItemSchema, PartialCargoItemSchema } from "~/lib/cargo.server";

describe("CargoItemSchema expiresAt null clearing", () => {
	const base = {
		name: "Milk",
		quantity: 1,
		unit: "unit" as const,
		domain: "food" as const,
		tags: [] as string[],
	};

	it("accepts an explicit null (clear expiry) without coercing to epoch", () => {
		const result = CargoItemSchema.safeParse({ ...base, expiresAt: null });
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.expiresAt).toBeNull();
	});

	it("parses a valid date string", () => {
		const result = CargoItemSchema.safeParse({
			...base,
			expiresAt: "2026-12-31",
		});
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.expiresAt).toBeInstanceOf(Date);
		expect(result.data.expiresAt?.toISOString().startsWith("2026-12-31")).toBe(
			true,
		);
	});

	it("omits expiresAt when undefined on full schema", () => {
		const result = CargoItemSchema.safeParse(base);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.expiresAt).toBeUndefined();
	});
});

describe("PartialCargoItemSchema expiresAt null clearing", () => {
	it("treats omitted expiresAt as undefined (leave unchanged)", () => {
		const result = PartialCargoItemSchema.safeParse({ quantity: 2 });
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.expiresAt).toBeUndefined();
	});

	it("accepts null to clear expiry without coercing to epoch", () => {
		const result = PartialCargoItemSchema.safeParse({ expiresAt: null });
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.expiresAt).toBeNull();
		expect(result.data.expiresAt).not.toBeInstanceOf(Date);
	});
});
