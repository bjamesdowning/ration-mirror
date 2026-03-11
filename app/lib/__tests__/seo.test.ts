import { describe, expect, it } from "vitest";
import { absoluteSiteUrl, ogMeta } from "~/lib/seo";

describe("absoluteSiteUrl", () => {
	it("prefixes root-relative paths with the site origin", () => {
		expect(absoluteSiteUrl("/blog/test-post")).toBe(
			"https://ration.mayutic.com/blog/test-post",
		);
	});

	it("leaves absolute URLs unchanged", () => {
		expect(absoluteSiteUrl("https://cdn.example.com/image.png")).toBe(
			"https://cdn.example.com/image.png",
		);
	});
});

describe("ogMeta", () => {
	it("adds article-specific open graph fields for blog posts", () => {
		const meta = ogMeta({
			title: "Test article",
			description: "Test description",
			path: "/blog/test-article",
			image: "/static/ration-logo.svg",
			type: "article",
			publishedTime: "2026-03-10",
			modifiedTime: "2026-03-11",
			tags: ["MCP", "meal planning"],
		});

		expect(meta).toContainEqual({ property: "og:type", content: "article" });
		expect(meta).toContainEqual({
			property: "article:published_time",
			content: "2026-03-10",
		});
		expect(meta).toContainEqual({
			property: "article:modified_time",
			content: "2026-03-11",
		});
		expect(meta).toContainEqual({
			property: "article:tag",
			content: "MCP",
		});
		expect(meta).toContainEqual({
			property: "article:tag",
			content: "meal planning",
		});
	});
});
