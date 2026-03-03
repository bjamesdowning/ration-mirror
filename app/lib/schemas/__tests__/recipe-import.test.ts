import { describe, expect, it } from "vitest";
import {
	ImportConfirmRequestSchema,
	RecipeImportRequestSchema,
} from "~/lib/schemas/recipe-import";

describe("RecipeImportRequestSchema", () => {
	it("accepts valid HTTPS URL", () => {
		const result = RecipeImportRequestSchema.safeParse({
			url: "https://example.com/recipe/chocolate-cake",
		});
		expect(result.success).toBe(true);
	});

	it("rejects HTTP URL", () => {
		const result = RecipeImportRequestSchema.safeParse({
			url: "http://example.com/recipe",
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid URL", () => {
		const result = RecipeImportRequestSchema.safeParse({
			url: "not-a-url",
		});
		expect(result.success).toBe(false);
	});
});

describe("ImportConfirmRequestSchema", () => {
	it("accepts valid UUID requestId", () => {
		const result = ImportConfirmRequestSchema.safeParse({
			requestId: "550e8400-e29b-41d4-a716-446655440000",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.requestId).toBe(
				"550e8400-e29b-41d4-a716-446655440000",
			);
		}
	});

	it("rejects non-UUID string", () => {
		const result = ImportConfirmRequestSchema.safeParse({
			requestId: "not-a-uuid",
		});
		expect(result.success).toBe(false);
	});

	it("rejects missing requestId", () => {
		const result = ImportConfirmRequestSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it("rejects empty requestId", () => {
		const result = ImportConfirmRequestSchema.safeParse({
			requestId: "",
		});
		expect(result.success).toBe(false);
	});
});
