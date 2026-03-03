import { describe, expect, it } from "vitest";
import { SearchQuerySchema } from "~/lib/schemas/search";

describe("SearchQuerySchema", () => {
	it("accepts a valid 2-character query", () => {
		const result = SearchQuerySchema.safeParse("ab");
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe("ab");
		}
	});

	it("accepts a query within max length", () => {
		const result = SearchQuerySchema.safeParse("rice");
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe("rice");
		}
	});

	it("trims leading and trailing whitespace", () => {
		const result = SearchQuerySchema.safeParse("  rice  ");
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe("rice");
		}
	});

	it("rejects query shorter than 2 characters", () => {
		const result = SearchQuerySchema.safeParse("a");
		expect(result.success).toBe(false);
	});

	it("rejects empty string", () => {
		const result = SearchQuerySchema.safeParse("");
		expect(result.success).toBe(false);
	});

	it("rejects whitespace-only string", () => {
		const result = SearchQuerySchema.safeParse("   ");
		expect(result.success).toBe(false);
	});

	it("rejects query longer than 256 characters", () => {
		const result = SearchQuerySchema.safeParse("a".repeat(257));
		expect(result.success).toBe(false);
	});

	it("accepts exactly 256 characters", () => {
		const result = SearchQuerySchema.safeParse("a".repeat(256));
		expect(result.success).toBe(true);
	});
});
