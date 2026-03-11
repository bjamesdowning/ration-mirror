import { describe, expect, it } from "vitest";
import { getPostBySlug, normalizeBlogDate } from "~/lib/blog.server";

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

describe("getPostBySlug", () => {
	it("returns enriched SEO metadata for blog posts", () => {
		const post = getPostBySlug("mcp-kitchen-assistant");

		expect(post).not.toBeNull();
		expect(post?.date).toBe("2026-03-10");
		expect(post?.dateModified).toBe("2026-03-11");
		expect(post?.authorName).toBe("Billy Downing");
		expect(post?.authorUrl).toBe("https://linkedin.com/in/billy-downing");
		expect(post?.image).toBe("/static/ration-logo.svg");
		expect(post?.tags).toContain("MCP");
		expect(post?.tags).toContain("meal planning");
	});
});
