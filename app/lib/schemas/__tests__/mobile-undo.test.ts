import { describe, expect, it } from "vitest";
import { mergeDeductions } from "../../undo-token.server";
import { UndoActionSchema } from "../mobile/undo";

describe("UndoActionSchema", () => {
	it("accepts a UUID token", () => {
		const parsed = UndoActionSchema.parse({
			token: "550e8400-e29b-41d4-a716-446655440000",
		});
		expect(parsed.token).toBe("550e8400-e29b-41d4-a716-446655440000");
	});

	it("rejects invalid tokens", () => {
		expect(UndoActionSchema.safeParse({ token: "not-a-uuid" }).success).toBe(
			false,
		);
	});
});

describe("mergeDeductions", () => {
	it("merges quantities for the same cargo id", () => {
		const target = [{ cargoId: "c1", quantity: 2 }];
		mergeDeductions(target, [
			{ cargoId: "c1", quantity: 3 },
			{ cargoId: "c2", quantity: 1 },
		]);
		expect(target).toEqual([
			{ cargoId: "c1", quantity: 5 },
			{ cargoId: "c2", quantity: 1 },
		]);
	});
});
