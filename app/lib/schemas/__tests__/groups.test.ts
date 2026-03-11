import { describe, expect, it } from "vitest";
import {
	RoleUpdateSchema,
	TransferOwnershipSchema,
} from "~/lib/schemas/groups";

describe("RoleUpdateSchema", () => {
	it("accepts admin role", () => {
		const result = RoleUpdateSchema.safeParse({ role: "admin" });
		expect(result.success).toBe(true);
	});

	it("accepts member role", () => {
		const result = RoleUpdateSchema.safeParse({ role: "member" });
		expect(result.success).toBe(true);
	});

	it("rejects owner role", () => {
		const result = RoleUpdateSchema.safeParse({ role: "owner" });
		expect(result.success).toBe(false);
	});

	it("rejects invalid role", () => {
		const result = RoleUpdateSchema.safeParse({ role: "invalid" });
		expect(result.success).toBe(false);
	});
});

describe("TransferOwnershipSchema", () => {
	const validUuid = "550e8400-e29b-41d4-a716-446655440000";

	it("accepts a valid UUID", () => {
		const result = TransferOwnershipSchema.safeParse({
			newOwnerMemberId: validUuid,
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid UUID", () => {
		const result = TransferOwnershipSchema.safeParse({
			newOwnerMemberId: "not-a-uuid",
		});
		expect(result.success).toBe(false);
	});

	it("rejects empty newOwnerMemberId", () => {
		const result = TransferOwnershipSchema.safeParse({
			newOwnerMemberId: "",
		});
		expect(result.success).toBe(false);
	});

	it("rejects missing newOwnerMemberId", () => {
		const result = TransferOwnershipSchema.safeParse({});
		expect(result.success).toBe(false);
	});
});
