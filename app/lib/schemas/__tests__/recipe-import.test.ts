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

	it("accepts optional pageHtml within bounds", () => {
		const result = RecipeImportRequestSchema.safeParse({
			url: "https://example.com/recipe",
			pageHtml: "x".repeat(200),
		});
		expect(result.success).toBe(true);
	});

	it("rejects pageHtml that is too short", () => {
		const result = RecipeImportRequestSchema.safeParse({
			url: "https://example.com/recipe",
			pageHtml: "short",
		});
		expect(result.success).toBe(false);
	});

	it("accepts photo-only import", () => {
		const result = RecipeImportRequestSchema.safeParse({
			photoBase64: "a".repeat(64),
			photoMimeType: "image/jpeg",
		});
		expect(result.success).toBe(true);
	});

	it("rejects photo without mime type", () => {
		const result = RecipeImportRequestSchema.safeParse({
			photoBase64: "a".repeat(64),
		});
		expect(result.success).toBe(false);
	});

	it("rejects empty body", () => {
		const result = RecipeImportRequestSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it("rejects oversized photo over 3MB", () => {
		const oversized = "a".repeat(Math.ceil((3 * 1024 * 1024 * 4) / 3) + 16);
		const result = RecipeImportRequestSchema.safeParse({
			photoBase64: oversized,
			photoMimeType: "image/jpeg",
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

describe("RecipeImportAISuccessSchema skeleton", () => {
	it("accepts ingredient-only skeleton", async () => {
		const { RecipeImportAISuccessSchema } = await import(
			"~/lib/schemas/recipe-import"
		);
		const result = RecipeImportAISuccessSchema.safeParse({
			status: "ok",
			title: "Smashburger",
			completeness: "skeleton",
			ingredients: [{ name: "beef", quantity: 0, unit: "unit" }],
			steps: [],
		});
		expect(result.success).toBe(true);
	});

	it("rejects ok with neither ingredients nor steps", async () => {
		const { RecipeImportAISuccessSchema } = await import(
			"~/lib/schemas/recipe-import"
		);
		const result = RecipeImportAISuccessSchema.safeParse({
			status: "ok",
			title: "Empty",
			ingredients: [],
			steps: [],
		});
		expect(result.success).toBe(false);
	});
});
