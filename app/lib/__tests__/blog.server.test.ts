import { describe, expect, it } from "vitest";
import { normalizeBlogDate } from "~/lib/blog.server";

describe("normalizeBlogDate", () => {
	it("keeps ISO date strings unchanged", () => {
		expect(normalizeBlogDate("2026-03-10")).toBe("2026-03-10");
	});

	it("converts Date objects to sitemap-safe YYYY-MM-DD strings", () => {
		expect(normalizeBlogDate(new Date("2026-03-10T00:00:00.000Z"))).toBe(
			"2026-03-10",
		);
	});

	it("parses non-ISO date strings into YYYY-MM-DD", () => {
		expect(normalizeBlogDate("Tue Mar 10 2026 00:00:00 GMT+0000")).toBe(
			"2026-03-10",
		);
	});
});
